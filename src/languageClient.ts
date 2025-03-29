import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  RevealOutputChannelOn,
  ProgressType,
} from "vscode-languageclient/node";
import * as path from "path";
import * as vscode from "vscode";
import { BazelKLSConfig } from "./config";
import * as fs from "fs";
import { downloadLanguageServer } from "./githubUtils";
import { findProcessesByName, killProcess } from "./processUtils";
import { Uri } from "vscode";
import { findJavaHome } from "./processUtils";
import { KotestTestClass } from "./kotest";
import { deleteDirectoryContents } from "./dirUtils";

export class KotlinLanguageClient {
  private client: LanguageClient | undefined;
  private openedFiles: Set<string> = new Set();
  private documentVersions: Map<string, number> = new Map();

  constructor(
    private context: vscode.ExtensionContext,
  ) {}

  private async maybeDownloadLanguageServer(
    config: BazelKLSConfig
  ): Promise<void> {
    const installPath = config.languageServerInstallPath;
    const version = config.languageServerVersion;

    if (fs.existsSync(path.join(installPath, "version"))) {
      const currentVersion = fs.readFileSync(
        path.join(installPath, "version"),
        "utf8"
      );
      if (currentVersion === version) {
        return;
      }

      await deleteDirectoryContents(installPath);
    }

    // show progress notification
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: "Downloading Kotlin Language Server",
        cancellable: false,
      },
      async (progress) => {
        await this.downloadLSP(installPath, version, progress);
      }
    );
  }

  private async downloadLSP(
    installPath: string,
    version: string,
    progress: vscode.Progress<{ message: string }>
  ): Promise<void> {
    return await downloadLanguageServer(installPath, version, progress);
  }

  public async start(
    config: BazelKLSConfig,
    options: { outputChannel: vscode.OutputChannel }
  ): Promise<void> {
    let languageServerPath = config.languageServerLocalPath;
    if (!languageServerPath) {
      await this.maybeDownloadLanguageServer(config);
      languageServerPath = path.join(
        config.languageServerInstallPath,
        "server",
        "bin",
        "kotlin-language-server"
      );
    } else {
      options.outputChannel.appendLine(
        `Using local language server from ${languageServerPath}`
      );
    }

    // kill any existing language server processes
    const processes = await findProcessesByName("kotlin-language-server");
    if (processes.length > 0) {
      await killProcess(processes[0].pid);
    }

    let env: any = { ...process.env };
    let javaHome = findJavaHome(config.jvmTarget);
    if (!javaHome) {
      vscode.window.showErrorMessage(
        `Could not find Java ${config.jvmTarget} installation. Please set bazelKLS.javaHome in your settings to the path of the Java installation to proceed.`
      );
      throw new Error(
        `Could not find Java ${config.jvmTarget} installation. Please set bazelKLS.javaHome in your settings to the path of the Java installation to proceed.`
      );
    }
    env.JAVA_HOME = javaHome;
    env.JAVA_OPTS = config.jvmOpts.join(" ");
    if (config.debugAttachEnabled) {
      options.outputChannel.appendLine(
        `Attaching debugger to language server on port ${config.debugAttachPort}`
      );
      env.KOTLIN_LANGUAGE_SERVER_OPTS = `-Xdebug -agentlib:jdwp=transport=dt_socket,address=${config.debugAttachPort},server=y,quiet=y,suspend=n`;
    }

    // Server options - configure the Kotlin Language Server executable
    const serverOptions: ServerOptions = {
      command: languageServerPath,
      args: [],
      options: {
        env: env,
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath,
      },
    };

    const storagePath = this.context.storageUri?.fsPath;
    if (storagePath) {
      await fs.mkdirSync(storagePath, { recursive: true });
    }

    // Client options - define the languages and workspace settings
    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: "file", language: "kotlin" }],
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher("**/*.kt"),
      },
      initializationOptions: {
        storagePath: this.context.storageUri?.fsPath,
      },
      outputChannel: options.outputChannel,
      revealOutputChannelOn: RevealOutputChannelOn.Never,
      progressOnInitialization: true,
    };

    // Create and start the language client
    this.client = new LanguageClient(
      "bazelKLS",
      "Bazel KLS",
      serverOptions,
      clientOptions
    );

    await this.client.start();
  }

  public async stop(): Promise<void> {
    if (this.client) {
      await this.client.stop();
      this.client = undefined;
    }
  }

  public getClient(): LanguageClient | undefined {
    return this.client;
  }

  private getNextVersion(uri: string): number {
    const currentVersion = this.documentVersions.get(uri) || 0;
    const nextVersion = currentVersion + 1;
    this.documentVersions.set(uri, nextVersion);
    return nextVersion;
  }

  async forceDocumentReload(uri: Uri | string, content: string): Promise<void> {
    const uriString = uri instanceof Uri ? uri.toString() : uri;
    if (this.openedFiles.has(uriString)) {
      await this.notifyFileClosed(uriString);
    }
    await this.notifyFileOpened(uriString, content);
  }

  public async refreshBazelClassPath(
    documentUri?: Uri | string,
    content?: string
  ): Promise<void> {
    await this.client?.sendRequest("workspace/executeCommand", {
      command: "kotlinRefreshBazelClassPath",
      arguments: [],
    });

    if (documentUri && content) {
      await this.forceDocumentReload(documentUri, content);
    }
  }

  public async getKotestTestClasses(
    documentUri: string
  ): Promise<KotestTestClass[]> {
    const response = await this.client?.sendRequest(
      "workspace/executeCommand",
      {
        command: "kotestTestsInfo",
        arguments: [documentUri],
      }
    );

    if (typeof response === "string") {
      return JSON.parse(response) as KotestTestClass[];
    }

    return [];
  }

  async notifyFileOpened(uri: Uri | string, content: string): Promise<void> {
    const uriString = uri instanceof Uri ? uri.toString() : uri;
    if (this.openedFiles.has(uriString)) {
      return;
    }

    this.client?.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: uriString,
        languageId: "kotlin",
        version: this.getNextVersion(uriString),
        text: content,
      },
    });

    this.openedFiles.add(uriString);
  }

  async notifyFileClosed(uri: Uri | string): Promise<void> {
    const uriString = uri instanceof Uri ? uri.toString() : uri;
    if (!this.openedFiles.has(uriString)) {
      return;
    }

    this.client?.sendNotification("textDocument/didClose", {
      textDocument: { uri: uriString },
    });

    this.openedFiles.delete(uriString);
    this.documentVersions.delete(uriString);
  }
}

export function configureLanguage(): void {
  // Source: https://github.com/Microsoft/vscode/blob/9d611d4dfd5a4a101b5201b8c9e21af97f06e7a7/extensions/typescript/src/typescriptMain.ts#L186
  // License: https://github.com/Microsoft/vscode/blob/9d611d4dfd5a4a101b5201b8c9e21af97f06e7a7/extensions/typescript/OSSREADME.json
  vscode.languages.setLanguageConfiguration("kotlin", {
    indentationRules: {
      // ^(.*\*/)?\s*\}.*$
      decreaseIndentPattern: /^(.*\*\/)?\s*\}.*$/,
      // ^.*\{[^}"']*$
      increaseIndentPattern: /^.*\{[^}"']*$/,
    },
    wordPattern:
      /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
    onEnterRules: [
      {
        // e.g. /** | */
        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
        afterText: /^\s*\*\/$/,
        action: {
          indentAction: vscode.IndentAction.IndentOutdent,
          appendText: " * ",
        },
      },
      {
        // e.g. /** ...|
        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
        action: { indentAction: vscode.IndentAction.None, appendText: " * " },
      },
      {
        // e.g.  * ...|
        beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
        action: { indentAction: vscode.IndentAction.None, appendText: "* " },
      },
      {
        // e.g.  */|
        beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
        action: { indentAction: vscode.IndentAction.None, removeText: 1 },
      },
      {
        // e.g.  *-----*/|
        beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
        action: { indentAction: vscode.IndentAction.None, removeText: 1 },
      },
    ],
  });
}
