import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import { ConfigurationManager } from '../config';

suite('ConfigurationManager Integration Test Suite', () => {
    let configManager: ConfigurationManager;
    const testContext: vscode.ExtensionContext = {
        // Create a simulated extension context with a storage path
        storagePath: path.join(__dirname, '../../../.vscode-test/storage'),
        storageUri: vscode.Uri.parse('vscode-test-uri'),
        globalStoragePath: '/path/to/global/storage',
        extension: {
            id: 'bazelKLS',
            extensionUri: vscode.Uri.parse('vscode-test-uri'),
            extensionPath: '/path/to/extension',
            isActive: true,
            extensionKind: vscode.ExtensionKind.Workspace,
            exports: {},
            activate: sinon.stub(),
            packageJSON: {
                name: 'bazelKLS',
                version: '1.0.0',
                engines: {
                    vscode: '1.0.0'
                }
            }
        },
        workspaceState: {
            get: sinon.stub().returns({}),
            update: sinon.stub().resolves(),
            keys: () => []
        },
        languageModelAccessInformation: {
            canSendRequest: sinon.stub(),
            onDidChange: sinon.stub(),
        },
        environmentVariableCollection: {
            get: sinon.stub(),
            getScoped: sinon.stub(),
            persistent: true,
            description: "",
            replace: sinon.stub(),
            append: sinon.stub(),
            prepend: sinon.stub(),
            forEach: sinon.stub(),
            delete: sinon.stub(),
            clear: sinon.stub(),
            [Symbol.iterator]: sinon.stub(),
        },
        logPath: '/path/to/log',
        logUri: vscode.Uri.parse('vscode-test-uri'),
        extensionMode: vscode.ExtensionMode.Development,
        
        globalStorageUri: vscode.Uri.parse('vscode-test-uri'),
        subscriptions: [],
        asAbsolutePath: (relativePath: string) => path.join(__dirname, '../../../.vscode-test', relativePath),
        secrets: {
            get: sinon.stub(),
            store: sinon.stub(),
            delete: sinon.stub(),
            onDidChange: sinon.stub(),
        },
        extensionUri: vscode.Uri.parse('vscode-test-uri'),
       
      globalState: {
        get: sinon.stub().returns({}),
        update: sinon.stub().resolves(),
        setKeysForSync: sinon.stub(),
        keys: () => []
      },
      extensionPath: '/path/to/extension',
    };

    // Setup: create a fresh ConfigurationManager before each test
    setup(() => {
        configManager = new ConfigurationManager("storagePath");

    });

    // Teardown: clean up any test-specific configurations
    teardown(async () => {
        // Reset any settings changed during testing
        await vscode.workspace.getConfiguration('bazelKLS').update('enabled', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('bazelKLS').update('jvmTarget', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('bazelKLS').update('jvmOpts', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('bazelKLS').update('buildFlags', undefined, vscode.ConfigurationTarget.Global);
    });

    test('getConfig should return default configuration', () => {
        const config = configManager.getConfig();
        console.log(config);
        
        assert.strictEqual(config.enabled, true);
        assert.strictEqual(config.jvmTarget, '11');
        assert.deepStrictEqual(config.jvmOpts, []);
        assert.strictEqual(config.languageServerVersion, 'v1.6.3-bazel');
        assert.strictEqual(config.javaHome, '');
        assert.strictEqual(config.languageServerLocalPath, '');
        assert.strictEqual(config.debugAttachEnabled, false);
        assert.strictEqual(config.debugAttachPort, 5009);
        assert.strictEqual(config.buildFlags.length, 0);
        assert.strictEqual(config.lazyCompilation, true);
        
        // Verify storage paths
        assert.strictEqual(
            config.languageServerInstallPath, 
            path.join("storagePath", 'languageServer')
        );
        assert.strictEqual(
            config.aspectSourcesPath, 
            path.join("storagePath", 'aspectSources')
        );
    });

    test('update should modify settings correctly', async () => {
        // Update settings
        await configManager.update({
                enabled: false,
                jvmTarget: '17',
                jvmOpts: ['-Xmx2g'],
                buildFlags: ["--config=remote"],
                lazyCompilation: true,
            } as any
        );
        
        // Create a fresh instance to read the updated config
        const updatedManager = new ConfigurationManager("storagePath");
        const updatedConfig = updatedManager.getConfig();
        
        // Verify settings were updated
        assert.strictEqual(updatedConfig.enabled, false);
        assert.strictEqual(updatedConfig.jvmTarget, '17');
        assert.deepStrictEqual(updatedConfig.jvmOpts, ['-Xmx2g']);
        assert.strictEqual(updatedConfig.buildFlags.length, 1);
        assert.deepEqual(updatedConfig.buildFlags, ["--config=remote"]);
        assert.strictEqual(updatedConfig.lazyCompilation, true);
    });
});