import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { ConfigurationManager } from '../config';

suite('ConfigurationManager Integration Test Suite', () => {
    let configManager: ConfigurationManager;
    const testContext = {
        // Create a simulated extension context with a storage path
        storagePath: path.join(__dirname, '../../../.vscode-test/storage')
    };

    // Setup: create a fresh ConfigurationManager before each test
    setup(() => {
        configManager = new ConfigurationManager(testContext.storagePath);
    });

    // Teardown: clean up any test-specific configurations
    teardown(async () => {
        // Reset any settings changed during testing
        await vscode.workspace.getConfiguration('bazelKLS').update('enabled', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('bazelKLS').update('jvmTarget', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('bazelKLS').update('jvmOpts', undefined, vscode.ConfigurationTarget.Global);
    });

    test('getConfig should return default configuration', () => {
        const config = configManager.getConfig();
        console.log(config);
        
        assert.strictEqual(config.enabled, true);
        assert.strictEqual(config.jvmTarget, '11');
        assert.deepStrictEqual(config.jvmOpts, []);
        assert.strictEqual(config.languageServerVersion, 'v1.3.14-bazel');
        assert.strictEqual(config.javaHome, '');
        assert.strictEqual(config.languageServerLocalPath, '');
        assert.strictEqual(config.debugAttachEnabled, false);
        assert.strictEqual(config.debugAttachPort, 5009);
        assert.strictEqual(config.buildFlags.length, 0)
        
        // Verify storage paths
        assert.strictEqual(
            config.languageServerInstallPath, 
            path.join(testContext.storagePath, 'languageServer')
        );
        assert.strictEqual(
            config.extensionSourcesPath, 
            path.join(testContext.storagePath, 'extensionSources')
        );
    });

    test('update should modify settings correctly', async () => {
        // Update settings
        await configManager.update({
                enabled: false,
                jvmTarget: '17',
                jvmOpts: ['-Xmx2g'],
                buildFlags: ["--config=remote"],
            } as any
        );
        
        // Create a fresh instance to read the updated config
        const updatedManager = new ConfigurationManager(testContext.storagePath);
        const updatedConfig = updatedManager.getConfig();
        
        // Verify settings were updated
        assert.strictEqual(updatedConfig.enabled, false);
        assert.strictEqual(updatedConfig.jvmTarget, '17');
        assert.deepStrictEqual(updatedConfig.jvmOpts, ['-Xmx2g']);
        assert.strictEqual(updatedConfig.buildFlags.length, 1);
        assert.equal(updatedConfig.buildFlags, ["--config=remote"])
    });
});