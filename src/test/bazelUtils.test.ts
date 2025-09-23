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
    let showWarningMessageStub: sinon.SinonStub;
    let replaceKotlinRulesReferencesStub: sinon.SinonStub;
    let checkDirectoryExistsStub: sinon.SinonStub;
    let bazelUtils: any;
    
    setup(() => {
        // Create stubs
        execAsyncStub = sinon.stub();
        existsSyncStub = sinon.stub();
        showErrorMessageStub = sinon.stub();
        showWarningMessageStub = sinon.stub();
        replaceKotlinRulesReferencesStub = sinon.stub();
        checkDirectoryExistsStub = sinon.stub().returns(true);
        
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
            'vscode': { window: { showErrorMessage: showErrorMessageStub, showWarningMessage: showWarningMessageStub } },
            'util': utilMock,
            'child_process': cpMock,
            'path': path, // Use actual path module
            './githubUtils': { replaceKotlinRulesReferences: replaceKotlinRulesReferencesStub },
            './dirUtils': { checkDirectoryExists: checkDirectoryExistsStub }
        });
    });
    
    teardown(() => {
        // Reset stubs for next test
        execAsyncStub.reset();
        existsSyncStub.reset();
        showErrorMessageStub.reset();
        showWarningMessageStub.reset();
        replaceKotlinRulesReferencesStub.reset();
        checkDirectoryExistsStub.reset();
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

        // Set up execAsyncStub to handle multiple calls
        execAsyncStub.onFirstCall().resolves({
            stdout: '@@//:BUILD.bazel',  // bzlmod enabled
            stderr: ''
        });
        execAsyncStub.onSecondCall().resolves({
            stdout: JSON.stringify({
                "rules_kotlin": "rules_kotlin~1.9.6~kt~kt"
            }),
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

        // Set up execAsyncStub to handle multiple calls
        execAsyncStub.onFirstCall().resolves({
            stdout: '@@//:BUILD.bazel',  // bzlmod enabled
            stderr: ''
        });
        execAsyncStub.onSecondCall().resolves({
            stdout: JSON.stringify({
                "rules_kotlin": "rules_kotlin~1.9.6~kt~kt"
            }),
            stderr: ''
        });

        const result = await bazelUtils.getBazelAspectArgs(aspectSourcesPath, workspaceRoot, bazelVersion, developmentMode);
        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[0], '--inject_repository=bazel_kotlin_lsp=/fake/aspect/sources/8/bazel/aspect');
        assert.strictEqual(result[1], '--aspects=@bazel_kotlin_lsp//:kotlin_lsp_info.bzl%kotlin_lsp_aspect');
    });

    test('detectKotlinRulesRepoName returns io_bazel_rules_kotlin for WORKSPACE setup', async () => {
        const workspaceRoot = "/fake/workspace";
        const bzlmodEnabled = false;

        const result = await bazelUtils.detectKotlinRulesRepoName(workspaceRoot, bzlmodEnabled);
        assert.strictEqual(result, 'io_bazel_rules_kotlin');
    });

    test('detectKotlinRulesRepoName returns rules_kotlin for bzlmod with rules_kotlin', async () => {
        const workspaceRoot = "/fake/workspace";
        const bzlmodEnabled = true;

        // Mock bazel mod dump_repo_mapping output with rules_kotlin
        execAsyncStub.resolves({
            stdout: JSON.stringify({
                "rules_kotlin": "rules_kotlin~1.9.6~kt~kt",
                "other_repo": "some_other_repo"
            }),
            stderr: ''
        });

        const result = await bazelUtils.detectKotlinRulesRepoName(workspaceRoot, bzlmodEnabled);
        assert.strictEqual(result, 'rules_kotlin');
    });

    test('detectKotlinRulesRepoName returns io_bazel_rules_kotlin for bzlmod with io_bazel_rules_kotlin', async () => {
        const workspaceRoot = "/fake/workspace";
        const bzlmodEnabled = true;

        // Mock bazel mod dump_repo_mapping output with io_bazel_rules_kotlin
        execAsyncStub.resolves({
            stdout: JSON.stringify({
                "io_bazel_rules_kotlin": "io_bazel_rules_kotlin",
                "other_repo": "some_other_repo"
            }),
            stderr: ''
        });

        const result = await bazelUtils.detectKotlinRulesRepoName(workspaceRoot, bzlmodEnabled);
        assert.strictEqual(result, 'io_bazel_rules_kotlin');
    });

    test('detectKotlinRulesRepoName throws error when neither repository found in bzlmod', async () => {
        const workspaceRoot = "/fake/workspace";
        const bzlmodEnabled = true;

        // Mock bazel mod dump_repo_mapping output without Kotlin rules
        execAsyncStub.resolves({
            stdout: JSON.stringify({
                "some_other_repo": "some_other_repo"
            }),
            stderr: ''
        });

        try {
            await bazelUtils.detectKotlinRulesRepoName(workspaceRoot, bzlmodEnabled);
            assert.fail('Expected function to throw an error');
        } catch (error) {
            assert.strictEqual((error as Error).message, 'Neither io_bazel_rules_kotlin nor rules_kotlin found in repository mapping');
        }
    });

});