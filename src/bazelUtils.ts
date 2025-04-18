import { checkDirectoryExists } from "./dirUtils";
import * as path from "path";
import { promisify } from "util";
import * as cp from "child_process";
import * as vscode from "vscode";
import * as fs from "fs";

const execAsync = promisify(cp.exec);

async function isBzlmodEnabled(workspaceRoot: string): Promise<boolean> {
  try {

    let buildFile = path.join(workspaceRoot, "BUILD.bazel");
    if (!fs.existsSync(buildFile)) {
      // if BUILD.bazel does not exist, try BUILD
      buildFile = path.join(workspaceRoot, "BUILD");
    }

    buildFile = path.basename(buildFile);
    // run this command to check if bzlmod is enabled
    const command =
      `bazel cquery //:${buildFile} --output=starlark --starlark:expr="target.label"`;

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

enum BazelMajorVersion {
  SIX = "6",
  SEVEN = "7",
  EIGHT = "8"
}

/**
 * Returns the major version of the Bazel version
 * @param workspaceRoot 
 * @returns string
 */
export async function getBazelMajorVersion(workspaceRoot: string): Promise<BazelMajorVersion> {
  const command = "bazel version";
  const result = await execAsync(command, { cwd: workspaceRoot });
  const stdout = result.stdout.trim();
  const lines = stdout.split('\n');
  const buildLabelLine = lines.find(line => line.trim().startsWith('Build label:'));
  if (!buildLabelLine) {
    vscode.window.showWarningMessage("Failed to get Bazel version");
    return BazelMajorVersion.SEVEN;
  }
  const version = buildLabelLine.split(':')[1].trim();
  return version.split(".")[0] as BazelMajorVersion;
}


export async function getBazelAspectArgs(
  aspectSourcesPath: string,
  workspaceRoot: string,
  bazelVersion: BazelMajorVersion,
  developmentMode: boolean = false
): Promise<string[]> {
  let aspectWorkspacePath = path.join(aspectSourcesPath, bazelVersion, "bazel", "aspect");
  if (developmentMode) {
    // if using development mode in vscode, use the aspect sources path directly
    aspectWorkspacePath = aspectSourcesPath;
  }
  if (!checkDirectoryExists(aspectWorkspacePath)) {
    throw new Error(
      `Bazel Aspect workspace not found at ${aspectWorkspacePath}`
    );
  }

  const bzlmodEnabled = await isBzlmodEnabled(workspaceRoot);
  let repoName = "@bazel_kotlin_lsp";
  if (bzlmodEnabled) {
    repoName = "@@bazel_kotlin_lsp";
  }

  let overrideRepo = `--override_repository=bazel_kotlin_lsp=${aspectWorkspacePath}`;
  if(bazelVersion === BazelMajorVersion.EIGHT) {
    overrideRepo = `--inject_repository=bazel_kotlin_lsp=${aspectWorkspacePath}`;
  }
  
  return [
    overrideRepo,
    `--aspects=${repoName}//:kotlin_lsp_info.bzl%kotlin_lsp_aspect`,
    "--output_groups=+lsp_infos",
  ];
}
