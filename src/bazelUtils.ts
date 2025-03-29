import { checkDirectoryExists } from "./dirUtils";{}
import * as path from "path";

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
