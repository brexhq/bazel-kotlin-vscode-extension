// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel('Brex Bazel Sync');

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
			const buildCmd = `bazel build --config=remote ${targets.join(' ')} --aspects=//bazel:kotlin_lsp_info.bzl%kotlin_lsp_aspect --output_groups=+lsp_infos`;
			outputChannel.appendLine(`Building targets: ${buildCmd}`);
			
			const process = cp.exec(buildCmd, { cwd: currentDir });
			
			// Stream output in real-time
			process.stdout?.on('data', (data) => {
				outputChannel.append(data.toString());
			});

			process.stderr?.on('data', (data) => {
				outputChannel.append(data.toString());
			});

			// Wait for process to complete
			const exitCode = await new Promise<number>((resolve, reject) => {
				process.on('exit', resolve);
				process.on('error', reject);
			});

			if (exitCode === 0) {
				const kotlinExt = vscode.extensions.getExtension('fwcd.kotlin');
				if (kotlinExt && !kotlinExt.isActive) {
					await kotlinExt.activate();
				}
				const api = kotlinExt.exports;
				if (api && api.kotlinApi) {
                    outputChannel.appendLine(`Not a Kotlin file, refreshing without content`);

                    // Force reanalysis of all open Kotlin files
                    for (const editor of vscode.window.visibleTextEditors) {
                        if (editor.document.fileName.endsWith('.kt')) {
                            outputChannel.appendLine(`Analyzing Kotlin file: ${path.basename(editor.document.uri.fsPath)}`);
                            const document = editor.document;
                            const content = document.getText();
                            outputChannel.appendLine(`File content length: ${content.length}`);
                            await api.kotlinApi.refreshBazelClassPath(document.uri, content);
                        }
                    }
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
}

// This method is called when your extension is deactivated
export function deactivate() {}
