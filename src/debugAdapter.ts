import * as vscode from "vscode";
import { getBazelAspectArgs } from "./bazelUtils";
import * as path from "path";
import { BazelKotlinDebugAdapterConfig } from "./config";
import { downloadDebugAdapter } from "./githubUtils";
import { findJavaHome } from "./processUtils";

export class KotlinBazelDebugConfigurationProvider
  implements vscode.DebugConfigurationProvider
{
  private readonly aspectSourcesPath: string;
  constructor(aspectSourcesPath: string) {
    this.aspectSourcesPath = aspectSourcesPath;
  }

  async resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    token?: vscode.CancellationToken
  ): Promise<vscode.DebugConfiguration | undefined>  {
    // Make sure the config exists and is for our debug type
    if (!config.type || config.type !== "kotlin") {
      return config;
    }

    // Inject aspect args so that required outputs are generated when LSP builds stuff on its end
    if (!config.buildFlags) {
      const aspectArgs = await getBazelAspectArgs(this.aspectSourcesPath, false);
      config.buildFlags = aspectArgs;
    }

    // You can also validate other required properties
    if (!config.bazelTarget) {
      return vscode.window
        .showErrorMessage("Bazel target is required")
        .then((_) => undefined);
    }

    if (!config.mainClass) {
      return vscode.window
        .showErrorMessage("Main class is required")
        .then((_) => undefined);
    }

    // Set default workspaceRoot if not provided
    if (!config.workspaceRoot) {
      config.workspaceRoot = folder?.uri.fsPath || "${workspaceFolder}";
    }

    return config;
  }
}

export class KotlinBazelDebugAdapterFactory
  implements vscode.DebugAdapterDescriptorFactory
{
  constructor(
    private readonly logger: vscode.OutputChannel,
    private readonly config: BazelKotlinDebugAdapterConfig
  ) {}

  async createDebugAdapterDescriptor(
    session: vscode.DebugSession
  ): Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
    this.logger.appendLine(
      `Creating debug adapter for session: ${session.type}`
    );

    const debugAdapterPath = await this.maybeDownloadDebugAdapter();
    this.logger.appendLine(`Using debug adapter binary: ${debugAdapterPath}`);
    const debugAdapterArgs: string[] = [];

    const env: { [key: string]: string } = {};

    // Copy only string values from process.env
    Object.keys(process.env).forEach((key) => {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key] as string;
      }
    });

    return new vscode.DebugAdapterExecutable(
      debugAdapterPath!,
      debugAdapterArgs,
      { env: env }
    );
  }

  private async maybeDownloadDebugAdapter(): Promise<string | undefined> {
    if (this.config.path) {
      return this.config.path;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: "Downloading Kotlin Debug Adapter",
        cancellable: false,
      },
      async (progress) => {
        await downloadDebugAdapter(
          "smocherla-brex",
          this.config.version,
          this.config.installPath,
          progress
        );
        return path.join(
          this.config.installPath,
          "bin",
          "kotlin-debug-adapter"
        );
      }
    );
    return undefined;
  }
}
