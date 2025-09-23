import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import proxyquire from 'proxyquire';


suite('GitHub Utils Test Suite', () => {
    let existsSyncStub: sinon.SinonStub;
    let readFileSyncStub: sinon.SinonStub;
    let writeFileSyncStub: sinon.SinonStub;
    let githubUtils: any;

    setup(() => {
        existsSyncStub = sinon.stub();
        readFileSyncStub = sinon.stub();
        writeFileSyncStub = sinon.stub();

        githubUtils = proxyquire.noCallThru().noPreserveCache()('../githubUtils', {
            'fs': {
                existsSync: existsSyncStub,
                readFileSync: readFileSyncStub,
                writeFileSync: writeFileSyncStub,
                '@noCallThru': true
            },
            'path': path // Use actual path module
        });
    });

    teardown(() => {
        sinon.restore();
    });

    test('replaceKotlinRulesReferences replaces io_bazel_rules_kotlin with rules_kotlin in bzl files', () => {
        const aspectPath = "/fake/aspect";
        const detectedRepoName = "rules_kotlin";

        // Mock file existence
        existsSyncStub.returns(true);

        // Mock file content with io_bazel_rules_kotlin references
        const originalContent = `load("@io_bazel_rules_kotlin//kotlin/internal:defs.bzl", "KtJvmInfo")
toolchains = [
    "@io_bazel_rules_kotlin//kotlin/internal:kt_toolchain_type",
]`;

        readFileSyncStub.returns(originalContent);

        githubUtils.replaceKotlinRulesReferences(aspectPath, detectedRepoName);

        // Verify writeFileSync was called for each file
        assert.strictEqual(writeFileSyncStub.callCount, 3);

        // Check the content was properly replaced
        const expectedContent = `load("@rules_kotlin//kotlin/internal:defs.bzl", "KtJvmInfo")
toolchains = [
    "@rules_kotlin//kotlin/internal:kt_toolchain_type",
]`;

        // Verify the replacement happened correctly (check first call for kotlin_lsp_info.bzl)
        assert.strictEqual(writeFileSyncStub.getCall(0).args[1], expectedContent);
    });

    test('replaceKotlinRulesReferences replaces rules_kotlin with io_bazel_rules_kotlin in bzl files', () => {
        const aspectPath = "/fake/aspect";
        const detectedRepoName = "io_bazel_rules_kotlin";

        existsSyncStub.returns(true);

        // Mock file content with rules_kotlin references
        const originalContent = `load("@rules_kotlin//kotlin/internal:defs.bzl", "KtJvmInfo")
toolchains = [
    "@rules_kotlin//kotlin/internal:kt_toolchain_type",
]`;

        readFileSyncStub.returns(originalContent);

        githubUtils.replaceKotlinRulesReferences(aspectPath, detectedRepoName);

        // Check the content was properly replaced
        const expectedContent = `load("@io_bazel_rules_kotlin//kotlin/internal:defs.bzl", "KtJvmInfo")
toolchains = [
    "@io_bazel_rules_kotlin//kotlin/internal:kt_toolchain_type",
]`;

        assert.strictEqual(writeFileSyncStub.getCall(0).args[1], expectedContent);
    });

    test('replaceKotlinRulesReferences replaces repo_name in MODULE.bazel', () => {
        const aspectPath = "/fake/aspect";
        const detectedRepoName = "rules_kotlin";

        existsSyncStub.withArgs(path.join(aspectPath, "bazel", "aspect", "kotlin_lsp_info.bzl")).returns(false);
        existsSyncStub.withArgs(path.join(aspectPath, "bazel", "aspect", "stdlib.bzl")).returns(false);
        existsSyncStub.withArgs(path.join(aspectPath, "bazel", "aspect", "MODULE.bazel")).returns(true);

        const originalModuleContent = `module(
    name = "bazel_kotlin_lsp",
)

bazel_dep(
    name = "rules_kotlin",
    version = "1.9.0",
    repo_name = "io_bazel_rules_kotlin",
)`;

        readFileSyncStub.returns(originalModuleContent);

        githubUtils.replaceKotlinRulesReferences(aspectPath, detectedRepoName);

        const expectedModuleContent = `module(
    name = "bazel_kotlin_lsp",
)

bazel_dep(
    name = "rules_kotlin",
    version = "1.9.0",
    repo_name = "rules_kotlin",
)`;

        // Should only be called once for MODULE.bazel
        assert.strictEqual(writeFileSyncStub.callCount, 1);
        assert.strictEqual(writeFileSyncStub.getCall(0).args[1], expectedModuleContent);
    });

    test('replaceKotlinRulesReferences handles non-existent files gracefully', () => {
        const aspectPath = "/fake/aspect";
        const detectedRepoName = "rules_kotlin";

        // Mock all files as non-existent
        existsSyncStub.returns(false);

        githubUtils.replaceKotlinRulesReferences(aspectPath, detectedRepoName);

        // Should not call writeFileSync for non-existent files
        assert.strictEqual(writeFileSyncStub.callCount, 0);
        assert.strictEqual(readFileSyncStub.callCount, 0);
    });

    test('replaceKotlinRulesReferences handles both repository name directions in same content', () => {
        const aspectPath = "/fake/aspect";
        const detectedRepoName = "rules_kotlin";

        existsSyncStub.returns(true);

        // Mock file content with mixed references (shouldn't happen in practice but good to test)
        const originalContent = `load("@io_bazel_rules_kotlin//kotlin/internal:defs.bzl", "KtJvmInfo")
load("@rules_kotlin//kotlin/internal:other.bzl", "Other")
toolchains = [
    "@io_bazel_rules_kotlin//kotlin/internal:kt_toolchain_type",
]`;

        readFileSyncStub.returns(originalContent);

        githubUtils.replaceKotlinRulesReferences(aspectPath, detectedRepoName);

        // Both should be replaced with the target repo name
        const expectedContent = `load("@rules_kotlin//kotlin/internal:defs.bzl", "KtJvmInfo")
load("@rules_kotlin//kotlin/internal:other.bzl", "Other")
toolchains = [
    "@rules_kotlin//kotlin/internal:kt_toolchain_type",
]`;

        assert.strictEqual(writeFileSyncStub.getCall(0).args[1], expectedContent);
    });
});