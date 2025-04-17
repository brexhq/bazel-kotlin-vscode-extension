import { checkDirectoryExists } from "./dirUtils";
import * as path from "path";
import { promisify } from "util";
import * as cp from "child_process";
import * as vscode from "vscode";

const execAsync = promisify(cp.exec);

async function isBzlmodEnabled(workspaceRoot: string): Promise<boolean> {
  try {
    // run this command to check if bzlmod is enabled
    const command =
      'bazel cquery //:BUILD.bazel --output=starlark --starlark:expr="target.label"';

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

export async function getBazelAspectArgs(
  aspectSourcesPath: string,
  workspaceRoot: string,
  quotePath: boolean = false
): Promise<string[]> {
  let aspectWorkspacePath = path.join(aspectSourcesPath, "bazel", "aspect");
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
  return [
    `--override_repository=bazel_kotlin_lsp=${aspectWorkspacePath}`,
    `--aspects=${repoName}//:kotlin_lsp_info.bzl%kotlin_lsp_aspect`,
    "--output_groups=+lsp_infos",
  ];
}
