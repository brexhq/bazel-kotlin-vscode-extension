// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { downloadAspectReleaseArchive } from "./githubUtils";
import { ConfigurationManager, BazelKLSConfig } from "./config";
import { KotlinLanguageClient, configureLanguage } from "./languageClient";
import { KotestTestController } from "./kotest";
import { getBazelAspectArgs } from "./bazelUtils";
import { ASPECT_RELEASE_VERSION } from "./constants";
import { KotlinBazelDebugConfigurationProvider, KotlinBazelDebugAdapterFactory } from "./debugAdapter";

let kotlinClient: KotlinLanguageClient;
let kotestController: KotestTestController;

// Extension activation function
export async function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Bazel KLS Sync");
  configureLanguage();
  context.subscriptions.push(outputChannel);

  const globalStoragePath = context.globalStorageUri.fsPath;
  if (!(await fs.existsSync(globalStoragePath))) {
    await fs.promises.mkdir(globalStoragePath);
  }

  const configManager = new ConfigurationManager(globalStoragePath);
  const config = configManager.getConfig();

  await downloadAspectRelease(config, context);

  // First create the language client
  kotlinClient = new KotlinLanguageClient(context);

  // Then create the test controller
  kotestController = new KotestTestController();
  kotestController.setClient(kotlinClient);
  context.subscriptions.push(kotestController);

  if (config.enabled) {
    await kotlinClient.start(config, { outputChannel });
  }

  // Command for clearing caches
  const clearCaches = vscode.commands.registerCommand(
    "bazel-kotlin-vscode-extension.clearCaches",
    async () => {
      if (!context.storageUri) {
        return;
      }

      const dbPath = path.join(context.storageUri.fsPath, "kls_database.db");

      try {
        // Delete the database file if it exists
        if (await fs.existsSync(dbPath)) {
          await fs.promises.unlink(dbPath);
          outputChannel.appendLine(
            "Successfully deleted language server cache database"
          );
        }

        // Stop the language server
        await kotlinClient.stop();

        // Restart the server if it was enabled
        if (config.enabled) {
          await kotlinClient.start(config, {
            outputChannel,
          });
          outputChannel.appendLine("Successfully restarted language server");
        }

        vscode.window.showInformationMessage("Successfully cleared all caches");
      } catch (error) {
        outputChannel.appendLine(`Error clearing caches: ${error}`);
        vscode.window.showErrorMessage(`Failed to clear caches: ${error}`);
      }
    }
  );

  context.subscriptions.push(clearCaches);

  // Command to bazel "sync" the current package
  // Works on directories with build files
  const bazelSync = vscode.commands.registerCommand(
    "bazel-kotlin-vscode-extension.bazelSync",
    async (uri: vscode.Uri) => {
      // If no uri provided (command palette), use active editor
      if (!uri) {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
          vscode.window.showErrorMessage("No file selected or open");
          return;
        }
        uri = activeEditor.document.uri;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("Not in a workspace");
        return;
      }

      // Find Bazel workspace root
      // TODO: support bzlmod
      let currentDir = workspaceFolder.uri.fsPath;
      while (currentDir !== path.dirname(currentDir)) {
        if (
          fs.existsSync(path.join(currentDir, "WORKSPACE")) ||
          fs.existsSync(path.join(currentDir, "WORKSPACE.bazel"))
        ) {
          break;
        }
        currentDir = path.dirname(currentDir);
      }

      if (currentDir === path.dirname(currentDir)) {
        vscode.window.showErrorMessage("No Bazel WORKSPACE found");
        return;
      }

      outputChannel.show();
      outputChannel.appendLine(`Starting Bazel sync for: ${uri.fsPath}`);
      outputChannel.appendLine(`Using Bazel workspace: ${currentDir}`);

      try {
        // Set the relative path to the nearest directory if its not a directory
        let relativePath = path.relative(currentDir, uri.fsPath);
        if (!fs.lstatSync(uri.fsPath).isDirectory()) {
          relativePath = path.dirname(relativePath);
        }

        // Find the nearest BUILD or BUILD.bazel file by traversing up
        let buildDir = path.join(currentDir, relativePath);
        while (buildDir !== currentDir) {
          // Check for BUILD file existence
          if (
            fs.existsSync(path.join(buildDir, "BUILD")) ||
            fs.existsSync(path.join(buildDir, "BUILD.bazel"))
          ) {
            break;
          }

          buildDir = path.dirname(buildDir);
        }

        // Update relative path to use the directory containing the BUILD file
        relativePath = path.relative(currentDir, buildDir);

        outputChannel.appendLine(`Using BUILD file directory: ${buildDir}`);
        // First, query for kt_jvm_library targets
        const queryCmd = `bazel query 'kind("kt_jvm_library", //${relativePath}/...)'`;
        outputChannel.appendLine(`Finding Kotlin targets: ${queryCmd}`);

        const targets = await new Promise<string[]>((resolve, reject) => {
          cp.exec(queryCmd, { cwd: currentDir }, (error, stdout, stderr) => {
            if (error) {
              reject(error);
              return;
            }
            resolve(
              stdout
                .trim()
                .split("\n")
                .map((target) => target.trim())
            );
          });
        });

        if (!targets) {
          outputChannel.appendLine("No Kotlin targets found");
          return;
        }

        // Then build those targets with the aspect
        let aspectSourcesPath = config.aspectSourcesPath;

        if (context.extensionMode === vscode.ExtensionMode.Development) {
          aspectSourcesPath = context.extensionUri.fsPath;
        }

        const bazelAspectArgs = await getBazelAspectArgs(
          aspectSourcesPath,
        );
        const buildCmd = `bazel build ${config.buildFlags.join(" ")} ${targets.join(
          " "
        )} ${bazelAspectArgs.join(" ")}`;
        outputChannel.appendLine(`Building targets: ${buildCmd}`);

        const bazelProcess = cp.exec(buildCmd, { cwd: currentDir });

        const disposable = {
          dispose: () => {
            if (bazelProcess) {
              outputChannel.appendLine('VS Code shutting down, terminating bazel process');
              try {
                bazelProcess.kill('SIGTERM');
              } catch (error) {
                outputChannel.appendLine(`Error terminating bazel process: ${error}`);
              }
            }
          }
        };

        context.subscriptions.push(disposable);

        // Stream output in real-time
        bazelProcess.stdout?.on("data", (data) => {
          outputChannel.append(data.toString());
        });

        bazelProcess.stderr?.on("data", (data) => {
          outputChannel.append(data.toString());
        });

        // Wait for process to complete
        const exitCode = await new Promise<number>((resolve, reject) => {
          bazelProcess.on("exit", resolve);
          bazelProcess.on("error", reject);
        });

        if (exitCode === 0) {
          // if build was successful, notify LSP of change in classpath
          if (config.enabled) {
            // Force reanalysis of all open Kotlin files
            let refreshedClassPath = false;
            await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Window,
                title: "Refreshing Kotlin classpath",
                cancellable: false,
              },
              async (progress) => {
                for (const editor of vscode.window.visibleTextEditors) {
                  if (editor.document.fileName.endsWith(".kt")) {
                    outputChannel.appendLine(
                      `Analyzing Kotlin file: ${path.basename(
                        editor.document.uri.fsPath
                      )}`
                    );
                    progress.report({
                      message: `Analyzing ${path.basename(
                        editor.document.uri.fsPath
                      )}`,
                    });
                    const document = editor.document;
                    const content = document.getText();
                    const started = Date.now();
                    if (!refreshedClassPath) {
                      await kotlinClient.refreshBazelClassPath(
                        document.uri,
                        content
                      );
                      refreshedClassPath = true;
                    }
                    const duration = Date.now() - started;
                    outputChannel.appendLine(`File analyzed in ${duration}ms`);
                  }
                  if (
                    editor.document.fileName.endsWith(".kt") &&
                    editor.document.uri.fsPath.includes("Test")
                  ) {
                    await kotestController.refreshTests(editor.document);
                  }
                }
              }
            );
          }
          vscode.window.showInformationMessage("Bazel sync completed");
        } else {
          throw new Error(`Bazel exited with code ${exitCode}`);
        }
      } catch (error) {
        outputChannel.appendLine(`Error: ${error}`);
        vscode.window.showErrorMessage(`Bazel sync failed: ${error}`);
      }
    }
  );

  context.subscriptions.push(bazelSync);

  // Don't forget to stop the client when deactivating
  context.subscriptions.push({
    dispose: async () => {
      await kotlinClient.stop();
    },
  });

  // regardless of whether we did bazel sync or not, show any kotest tests for test files
  const kotestDocumentLister = vscode.workspace.onDidOpenTextDocument(async (document) => {
    if(document.fileName.endsWith(".kt") && document.uri.fsPath.includes("Test")) {
      await kotestController.refreshTests(document);
    }
  });

  context.subscriptions.push(kotestDocumentLister);

  if (config.debugAdapter.enabled) {
    const outputChannel = vscode.window.createOutputChannel('Kotlin Bazel Debug');
    const factory = new KotlinBazelDebugAdapterFactory(outputChannel, config.debugAdapter);
  
    context.subscriptions.push(
      vscode.debug.registerDebugAdapterDescriptorFactory('kotlin', factory)
    );
    const configProvider = new KotlinBazelDebugConfigurationProvider(config.aspectSourcesPath);
    context.subscriptions.push(
      vscode.debug.registerDebugConfigurationProvider('kotlin', configProvider)
    );

    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('Kotlin Bazel Debug extension activated');
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function downloadAspectRelease(
  config: BazelKLSConfig,
  context: vscode.ExtensionContext
) {
  const sourcesPath = config.aspectSourcesPath;
  if(!fs.existsSync(sourcesPath)) {
    await fs.mkdirSync(sourcesPath, { recursive: true });
  }
  await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: "Downloading kls aspect archive",
        cancellable: false,
      },
      async (progress) => {
        await downloadAspectReleaseArchive(
          "bazel-kotlin-vscode-extension",
          ASPECT_RELEASE_VERSION,
          sourcesPath,
          progress
        );
      }
    );
}
