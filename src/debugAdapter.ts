import * as vscode from "vscode";
import { getBazelAspectArgs } from "./bazelUtils";
import * as path from "path";
import { BazelKotlinDebugAdapterConfig } from "./config";
import { downloadDebugAdapter } from "./githubUtils";

export class KotlinBazelDebugConfigurationProvider
  implements vscode.DebugConfigurationProvider
{
  private readonly aspectSourcesPath: string;
  constructor(aspectSourcesPath: string) {
    this.aspectSourcesPath = aspectSourcesPath;
  }

  resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    token?: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DebugConfiguration> {
    // Make sure the config exists and is for our debug type
    if (!config.type || config.type !== "kotlin") {
      return config;
    }

    // Inject aspect args so that required outputs are generated when LSP builds stuff on its end
    if (!config.buildFlags) {
      const aspectArgs = getBazelAspectArgs(this.aspectSourcesPath);
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

    // Path to your debug adapter binary
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
    env.JAVA_TOOL_OPTIONS = `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5011`;

    // Return a descriptor that tells VS Code to launch your binary
    return new vscode.DebugAdapterExecutable(
      debugAdapterPath!,
      debugAdapterArgs,
      { env: env }
    );
  }

  private async maybeDownloadDebugAdapter(): Promise<string | undefined> {
    if (this.config.path) {
      this.logger.appendLine(
        `Using debug adapter from local path: ${this.config.path}`
      );
      return this.config.path;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: "Downloading Kotlin Language Server",
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
