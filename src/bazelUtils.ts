import * as fs from "fs/promises";
import * as path from "path";

async function isDirectory(path: string) {
  try {
    const stats = await fs.stat(path);
    return stats.isDirectory();
  } catch (error) {
    console.error("Error checking if path is directory:", error);
    return false;
  }
}

async function checkDirectoryExists(path: string) {
  try {
    const stats = await fs.stat(path);
    return stats.isDirectory();
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // Directory does not exist
      return false;
    }
    throw error; // Some other error occurred
  }
}

export async function getBazelAspectArgs(
  extensionSourcesPath: string,
  isDevelopmentMode: boolean
): Promise<string[]> {
  const files = await fs.readdir(extensionSourcesPath);
  let extensionRepoRoot: string | undefined = extensionSourcesPath;
  // If we are in development mode, the extension sources are in the repository where the extension is checked out
  // so use the aspect from there
  if (!isDevelopmentMode) {
    extensionRepoRoot = files.find(async (file) => {
      (await isDirectory(file)) &&
        file.includes("bazel-kotlin-vscode-extension");
    });
  }
  if (!extensionRepoRoot) {
    throw new Error(
      `Extension sources root not found in ${extensionSourcesPath}`
    );
  }

  let aspectWorkspacePath = path.join(
    extensionSourcesPath,
    extensionRepoRoot,
    "bazel",
    "aspect"
  );
  if (isDevelopmentMode) {
    aspectWorkspacePath = path.join(extensionSourcesPath, "bazel", "aspect");
  }
  if (!checkDirectoryExists(aspectWorkspacePath)) {
    throw new Error(
      `Bazel Aspect workspace not found at ${aspectWorkspacePath}`
    );
  }

  return [
    `--override_repository=bazel_kotlin_lsp="${aspectWorkspacePath}"`,
    "--aspects=@bazel_kotlin_lsp//:kotlin_lsp_info.bzl%kotlin_lsp_aspect",
    "--output_groups=+lsp_infos",
  ];
}
