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
  aspectSourcesPath: string,
): Promise<string[]> {

  let aspectWorkspacePath = path.join(
    aspectSourcesPath,
    "bazel",
    "aspect"
  );
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
