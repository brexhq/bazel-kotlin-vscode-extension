import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import * as proxyquireLib from 'proxyquire';

const proxyquire = proxyquireLib.noCallThru().noPreserveCache();

suite('Bazel Utils Test Suite', () => {
    // Create stubs
    let execAsyncStub: sinon.SinonStub;
    let existsSyncStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let bazelUtils: any;
    
    setup(() => {
        // Create stubs
        execAsyncStub = sinon.stub();
        existsSyncStub = sinon.stub();
        showErrorMessageStub = sinon.stub();
        
        // Mocked promisify that returns our execAsyncStub
        const promisifyMock = (original: any) => execAsyncStub;
        
        // Mock the entire util module
        const utilMock = {
            promisify: promisifyMock
        };
        
        // Mock child_process module
        const cpMock = {
            exec: () => {} // We don't need to stub this since we're stubbing promisify
        };
        
        // Configure module mocks
        bazelUtils = proxyquire('../bazelUtils', {
            'fs': { existsSync: existsSyncStub },
            'vscode': { window: { showErrorMessage: showErrorMessageStub } },
            'util': utilMock,
            'child_process': cpMock,
            'path': path // Use actual path module
        });
    });
    
    teardown(() => {
        sinon.restore();
    });
    
    test('isBzlmodEnabled with bzlmod enabled', async () => {
        const workspaceRoot = "/fake/workspace";
        
        // Configure fs.existsSync to return true
        existsSyncStub.returns(true);
        
        // Configure execAsyncStub to return the expected result
        execAsyncStub.resolves({
            stdout: '@@//:BUILD.bazel',
            stderr: ''
        });
        
        const result = await bazelUtils.isBzlmodEnabled(workspaceRoot);
        
        // Assert the result is true
        assert.strictEqual(result, true);
        
        // Verify the stubs were called correctly
        assert.strictEqual(existsSyncStub.calledOnce, true);
        assert.strictEqual(execAsyncStub.calledOnce, true);
    });

    test('getBazelMajorVersion works', async () => {
        const workspaceRoot = "/fake/workspace";
        
        execAsyncStub.resolves({
            stdout: `Bazelisk version: 1.25.0
Build label: 7.4.1
Build target: @@//src/main/java/com/google/devtools/build/lib/bazel:BazelServer
Build time: Mon Nov 11 21:27:36 2024 (1731360456)
Build timestamp: 1731360456
Build timestamp as int: 1731360456
            `,
            stderr: ''
        });

        const result = await bazelUtils.getBazelMajorVersion(workspaceRoot);
        assert.strictEqual(result, '7');
    });
    
    test('getBazelAspectArgs works with bazel 7 with bzlmod enabled', async () => {
        const workspaceRoot = "/fake/workspace";
        const aspectSourcesPath = "/fake/aspect/sources";
        const bazelVersion = '7';
        const developmentMode = false;

        existsSyncStub.returns(true);
        execAsyncStub.resolves({
            stdout: '@@//:BUILD.bazel',
            stderr: ''
        });

        const result = await bazelUtils.getBazelAspectArgs(aspectSourcesPath, workspaceRoot, bazelVersion, developmentMode);
        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[0], '--override_repository=bazel_kotlin_lsp=/fake/aspect/sources/7/bazel/aspect');
        assert.strictEqual(result[1], '--aspects=@@bazel_kotlin_lsp//:kotlin_lsp_info.bzl%kotlin_lsp_aspect');
    });

    test('getBazelAspectArgs works with bazel 7 with bzlmod disabled', async () => {
        const workspaceRoot = "/fake/workspace";
        const aspectSourcesPath = "/fake/aspect/sources";
        const bazelVersion = '7';
        const developmentMode = false;

        existsSyncStub.returns(true);
        execAsyncStub.resolves({
            stdout: '@//:BUILD.bazel',
            stderr: ''
        });

        const result = await bazelUtils.getBazelAspectArgs(aspectSourcesPath, workspaceRoot, bazelVersion, developmentMode);
        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[0], '--override_repository=bazel_kotlin_lsp=/fake/aspect/sources/7/bazel/aspect');
        assert.strictEqual(result[1], '--aspects=@bazel_kotlin_lsp//:kotlin_lsp_info.bzl%kotlin_lsp_aspect');
    });

    test('getBazelAspectArgs works with bazel 8', async () => {
        const workspaceRoot = "/fake/workspace";
        const aspectSourcesPath = "/fake/aspect/sources";
        const bazelVersion = '8';
        const developmentMode = false;  

        existsSyncStub.returns(true);
        execAsyncStub.resolves({
            stdout: '@@//:BUILD.bazel',
            stderr: ''
        });

        const result = await bazelUtils.getBazelAspectArgs(aspectSourcesPath, workspaceRoot, bazelVersion, developmentMode);
        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[0], '--inject_repository=bazel_kotlin_lsp=/fake/aspect/sources/8/bazel/aspect');
        assert.strictEqual(result[1], '--aspects=@bazel_kotlin_lsp//:kotlin_lsp_info.bzl%kotlin_lsp_aspect');
    });
    
});