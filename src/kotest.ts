import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { Range } from 'vscode';

export interface KotestTestClass {
    className: string;
    range: Range | null;
    describes: DescribeInfo[];
}

export interface DescribeInfo {
    describe: string;
    range: Range | null;
    its: ItInfo[];
}

export interface ItInfo {
    it: string;
    range: Range | null;
}

export class KotestTestController {
    private testController: vscode.TestController;
    private kotlinClient: any;

    constructor() {
        this.testController = vscode.tests.createTestController('kotestTests', 'Kotest Tests');
        this.testController.createRunProfile('Run', vscode.TestRunProfileKind.Run, this.runTests.bind(this));
    }

    setClient(client: any) {
        this.kotlinClient = client;
    }

    dispose() {
        this.testController.dispose();
    }

    async refreshTests(document: vscode.TextDocument) {
        const testClasses = await this.kotlinClient.getKotestTestClasses(document.uri.toString());
        
        const fileId = document.uri.toString();
        this.testController.items.delete(fileId);
        
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const relativePath = workspaceFolder 
            ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath)
            : path.basename(document.uri.fsPath);
        
        const fileTestItem = this.testController.createTestItem(fileId, relativePath, document.uri);
        this.testController.items.add(fileTestItem);

        testClasses.forEach((testClass: KotestTestClass) => {
            const classItem = this.testController.createTestItem(
                `${fileId}:${testClass.className}`,
                testClass.className,
                document.uri
            );
            if (testClass.range) {
                classItem.range = testClass.range;
            }
            fileTestItem.children.add(classItem);

            testClass.describes.forEach((describe: DescribeInfo) => {
                this.addDescribeTestItem(describe, classItem, testClass.className, document.uri, fileId);
            });
        });
    }

    private addDescribeTestItem(
        describe: DescribeInfo, 
        parent: vscode.TestItem, 
        className: string,
        uri: vscode.Uri,
        fileId: string
    ) {
        const describeItem = this.testController.createTestItem(
            `${fileId}:${className}:${describe.describe}`,
            `${className}#${describe.describe}`,
            uri
        );
        if (describe.range) {
            describeItem.range = describe.range;
        }
        parent.children.add(describeItem);

        describe.its.forEach((it: ItInfo) => {
            const itItem = this.testController.createTestItem(
                `${fileId}:${className}:${describe.describe}:${it.it}`,
                `${className}#${describe.describe} -- ${it.it}`,
                uri
            );
            if (it.range) {
                itItem.range = it.range;
            }
            describeItem.children.add(itItem);
        });
    }

    private async runTests(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
        const run = this.testController.createTestRun(request);
        
        for (const test of request.include ?? []) {
            run.enqueued(test);
            try {
                const uri = test.uri;
                if (!uri) {continue;}

                const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
                if (!workspaceFolder) {continue;}

                const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
                const testFilter = `--test_filter="${test.label}"`;

                // First query for test targets
                const queryCommand = `bazel query 'kind(kt_jvm_test, //${path.dirname(relativePath)}:all)'`;
                const targets = await new Promise<string>((resolve, reject) => {
                    cp.exec(queryCommand, { cwd: workspaceFolder.uri.fsPath }, (error, stdout) => {
                        if (error) {reject(error);}
                        else {resolve(stdout.trim());}
                    });
                });

                if (!targets) {
                    run.appendOutput(`No test targets found in //${path.dirname(relativePath)}/...\n`);
                    continue;
                }

                run.appendOutput(`\n--- Running test: ${test.label} ---\n\n`);
                const command = `bazel test --test_output=all --color=yes --terminal_columns=120 ${targets} ${testFilter}`;
                run.appendOutput(`Command: ${command}\n\n`);

                const bazelProcess = cp.spawn('bash', ['-c', command], { 
                    cwd: workspaceFolder.uri.fsPath,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                bazelProcess.stdout?.on('data', (data: Buffer) => {
                    run.appendOutput(data.toString().replace(/\n/g, '\r\n'));
                });

                bazelProcess.stderr?.on('data', (data: Buffer) => {
                    run.appendOutput(data.toString().replace(/\n/g, '\r\n'));
                });

                const exitCode = await new Promise<number>((resolve) => {
                    bazelProcess.on('exit', (code) => {
                        resolve(code ?? 1);
                    });
                });

                run.appendOutput(`\n--- Test ${test.label} ${exitCode === 0 ? 'passed' : 'failed'} ---\n\n`);

                if (exitCode === 0) {
                    run.passed(test);
                } else {
                    run.failed(test, new vscode.TestMessage('Test failed'));
                }
            } catch (e) {
                run.appendOutput(`\nError: ${e}\n`);
                run.failed(test, new vscode.TestMessage(`Error: ${e}`));
            }
        }
        
        run.end();
    }
}
