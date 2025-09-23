import { checkDirectoryExists } from "./dirUtils";
import * as path from "path";
import { promisify } from "util";
import * as cp from "child_process";
import * as vscode from "vscode";
import * as fs from "fs";
import { replaceKotlinRulesReferences } from "./githubUtils";

const execAsync = promisify(cp.exec);

export async function isBzlmodEnabled(workspaceRoot: string): Promise<boolean> {
  try {
    let buildFile = path.join(workspaceRoot, "BUILD.bazel");
    if (!fs.existsSync(buildFile)) {
      // if BUILD.bazel does not exist, try BUILD
      buildFile = path.join(workspaceRoot, "BUILD");
    }

    buildFile = path.basename(buildFile);
    // run this command to check if bzlmod is enabled
    const command = `bazel cquery //:${buildFile} --output=starlark --starlark:expr="target.label"`;

    const result = await execAsync(command, { cwd: workspaceRoot });
    const stdout = result.stdout.trim();

    return stdout.startsWith("@@");
  } catch (error) {
    vscode.window.showErrorMessage(
      `(Bazel KLS) Error checking bzlmod is enabled: ${
        (error as Error).message
      }`
    );
    return false;
  }
}

/**
 * Detects which Kotlin rules repository name is used in the workspace.
 * Returns either "rules_kotlin" or "io_bazel_rules_kotlin" based on the setup.
 * @param workspaceRoot
 * @param bzlmodEnabled Whether bzlmod is enabled in the workspace
 * @returns The repository name used for Kotlin rules
 */
export async function detectKotlinRulesRepoName(workspaceRoot: string, bzlmodEnabled: boolean): Promise<string> {
  if (!bzlmodEnabled) {
    // For WORKSPACE setups, assume io_bazel_rules_kotlin
    return "io_bazel_rules_kotlin";
  }

  // For bzlmod setups, check the repository mapping
  const command = "bazel mod dump_repo_mapping workspace";
  const result = await execAsync(command, { cwd: workspaceRoot });
  const stdout = result.stdout.trim();

  // Parse the JSON output
  const repoMapping = JSON.parse(stdout);

  // Check if io_bazel_rules_kotlin exists in the mapping
  if (repoMapping.hasOwnProperty("io_bazel_rules_kotlin")) {
    return "io_bazel_rules_kotlin";
  }

  // Check if rules_kotlin exists in the mapping
  if (repoMapping.hasOwnProperty("rules_kotlin")) {
    return "rules_kotlin";
  }

  // If neither exists, throw an error
  throw new Error("Neither io_bazel_rules_kotlin nor rules_kotlin found in repository mapping");
}

export enum BazelMajorVersion {
  SIX = "6",
  SEVEN = "7",
  EIGHT = "8",
}

/**
 * Returns the major version of the Bazel version
 * @param workspaceRoot
 * @returns string
 */
export async function getBazelMajorVersion(
  workspaceRoot: string
): Promise<BazelMajorVersion> {
  const command = "bazel version";
  const result = await execAsync(command, { cwd: workspaceRoot });
  const stdout = result.stdout.trim();
  const lines = stdout.split("\n");
  const buildLabelLine = lines.find((line) =>
    line.trim().startsWith("Build label:")
  );
  if (!buildLabelLine) {
    vscode.window.showWarningMessage("Failed to get Bazel version");
    return BazelMajorVersion.SEVEN;
  }
  const version = buildLabelLine.split(":")[1].trim();
  return version.split(".")[0] as BazelMajorVersion;
}

export async function getBazelAspectArgs(
  aspectSourcesPath: string,
  workspaceRoot: string,
  bazelVersion: BazelMajorVersion,
  developmentMode: boolean = false
): Promise<string[]> {
  let aspectWorkspacePath = path.join(
    aspectSourcesPath,
    bazelVersion,
    "bazel",
    "aspect"
  );
  if (!checkDirectoryExists(aspectWorkspacePath)) {
    throw new Error(
      `Bazel Aspect workspace not found at ${aspectWorkspacePath}`
    );
  }

  const bzlmodEnabled = await isBzlmodEnabled(workspaceRoot);

  // Detect which Kotlin rules repository is used and update aspect files accordingly
  try {
    const detectedRepoName = await detectKotlinRulesRepoName(workspaceRoot, bzlmodEnabled);
    replaceKotlinRulesReferences(path.join(aspectSourcesPath, bazelVersion), detectedRepoName);
  } catch (error) {
    vscode.window.showWarningMessage(
      `(Bazel KLS) Could not detect Kotlin rules repository, using default: ${
        (error as Error).message
      }`
    );
  }
  let repoName = "@bazel_kotlin_lsp";
  if (bzlmodEnabled) {
    repoName = "@@bazel_kotlin_lsp";
  }

  let overrideRepo = `--override_repository=bazel_kotlin_lsp=${aspectWorkspacePath}`;
  if (bazelVersion === BazelMajorVersion.EIGHT) {
    repoName = "@bazel_kotlin_lsp";
    overrideRepo = `--inject_repository=bazel_kotlin_lsp=${aspectWorkspacePath}`;
  }

  return [
    overrideRepo,
    `--aspects=${repoName}//:kotlin_lsp_info.bzl%kotlin_lsp_aspect`,
    "--output_groups=+lsp_infos",
  ];
}

/**
 * Provides the tool tag for the current editor, useful in attaching to a bazel build invocation
 * @returns string
 */

export function getToolTag(): string {
  const appName = vscode.env.appName;
  switch (appName) {
    case "Cursor":
      return "bazelkls:cursor";
    case "Visual Studio Code":
      return "bazelkls:vscode";
    default:
      return "bazelkls:unknown";
  }
}
