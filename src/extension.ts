// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigurationManager } from './config';
import { KotlinLanguageClient, configureLanguage } from './languageClient';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel('Brex Bazel Sync');

	configureLanguage();
	context.subscriptions.push(outputChannel);

	const globalStoragePath = context.globalStorageUri.fsPath;
    if (!(await fs.existsSync(globalStoragePath))) {
        await fs.promises.mkdir(globalStoragePath);
    }

	const configManager = new ConfigurationManager(globalStoragePath);
	const config = configManager.getConfig()

	const kotlinClient = new KotlinLanguageClient(context);
	if(config.kotlinLanguageServer.enabled) {
		await kotlinClient.start(config.kotlinLanguageServer, { outputChannel });
	}

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const bazelSync = vscode.commands.registerCommand('bazel-kotlin-vscode-extension.bazelSync', async (uri: vscode.Uri) => {
		// If no uri provided (command palette), use active editor
		if (!uri) {
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				vscode.window.showErrorMessage('No file selected or open');
				return;
			}
			uri = activeEditor.document.uri;
		}

		const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('Not in a workspace');
			return;
		}

		// Find Bazel workspace root
		let currentDir = workspaceFolder.uri.fsPath;
		while (currentDir !== path.dirname(currentDir)) {
			if (fs.existsSync(path.join(currentDir, 'WORKSPACE')) || 
				fs.existsSync(path.join(currentDir, 'WORKSPACE.bazel'))) {
				break;
			}
			currentDir = path.dirname(currentDir);
		}

		if (currentDir === path.dirname(currentDir)) {
			vscode.window.showErrorMessage('No Bazel WORKSPACE found');
			return;
		}

		outputChannel.show();
		outputChannel.appendLine(`Starting Bazel sync for: ${uri.fsPath}`);
		outputChannel.appendLine(`Using Bazel workspace: ${currentDir}`);

		try {
			const relativePath = path.relative(currentDir, uri.fsPath);
			
			// Check if RBE should be used
			const useRBE = process.env.BREX_BAZEL_USE_RBE_WITH_INTELLIJ_ON_MAC === '1' || process.env.BREX_BAZEL_USE_RBE_WITH_INTELLIJ_ON_MAC === 'true';
			const configFlag = useRBE ? '--config=remote' : '';
			outputChannel.appendLine(`Using RBE: ${useRBE}`);

			// First, query for kt_jvm_library targets
			const queryCmd = `bazel query 'kind("kt_jvm_library", //${relativePath}/...)'`;
			outputChannel.appendLine(`Finding Kotlin targets: ${queryCmd}`);
			
			const targets = await new Promise<string[]>((resolve, reject) => {
				cp.exec(queryCmd, { cwd: currentDir }, (error, stdout, stderr) => {
					if (error) {
						reject(error);
						return;
					}
					resolve(stdout.trim().split('\n').map(target => target.trim()));
				});
			});

			if (!targets) {
				outputChannel.appendLine('No Kotlin targets found');
				return;
			}

			// Then build those targets with the aspect
			const buildCmd = `bazel build ${configFlag} ${targets.join(' ')} --aspects=//bazel:kotlin_lsp_info.bzl%kotlin_lsp_aspect --output_groups=+lsp_infos`;
			outputChannel.appendLine(`Building targets: ${buildCmd}`);
			
			const bazelProcess = cp.exec(buildCmd, { cwd: currentDir });
			
			// Stream output in real-time
			bazelProcess.stdout?.on('data', (data) => {
				outputChannel.append(data.toString());
			});

			bazelProcess.stderr?.on('data', (data) => {
				outputChannel.append(data.toString());
			});

			// Wait for process to complete
			const exitCode = await new Promise<number>((resolve, reject) => {
				bazelProcess.on('exit', resolve);
				bazelProcess.on('error', reject);
			});

			if (exitCode === 0) {
				if (config.kotlinLanguageServer.enabled) {
					// Force reanalysis of all open Kotlin files
					let refreshedClassPath = false;
					await vscode.window.withProgress({
						location: vscode.ProgressLocation.Window,
						title: 'Refreshing Kotlin classpath',
						cancellable: false
					}, async (progress) => {
						for (const editor of vscode.window.visibleTextEditors) {
							if (editor.document.fileName.endsWith('.kt')) {
								outputChannel.appendLine(`Analyzing Kotlin file: ${path.basename(editor.document.uri.fsPath)}`);
								progress.report({ message: `Analyzing ${path.basename(editor.document.uri.fsPath)}` });
								const document = editor.document;
								const content = document.getText();
								const started = Date.now();
								if(!refreshedClassPath) {
									await kotlinClient.refreshBazelClassPath(document.uri, content);
									refreshedClassPath = true;
								}
								const duration = Date.now() - started;
								outputChannel.appendLine(`File analyzed in ${duration}ms`);
							}
						}
					});
				}
				vscode.window.showInformationMessage('Bazel sync completed');
			} else {
				throw new Error(`Bazel exited with code ${exitCode}`);
			}
		} catch (error) {
			outputChannel.appendLine(`Error: ${error}`);
			vscode.window.showErrorMessage(`Bazel sync failed: ${error}`);
		}
	});

	context.subscriptions.push(bazelSync);

	// Don't forget to stop the client when deactivating
	context.subscriptions.push({
		dispose: async () => {
			await kotlinClient.stop();
		}
	});
}

// This method is called when your extension is deactivated
export function deactivate() {

}
