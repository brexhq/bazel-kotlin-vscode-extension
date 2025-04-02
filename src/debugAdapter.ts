import * as vscode from "vscode";
import { getBazelAspectArgs } from "./bazelUtils";
import * as path from "path";
import { BazelKotlinDebugAdapterConfig } from "./config";
import { downloadDebugAdapter } from "./githubUtils";
import { findJavaHome } from "./processUtils";
import * as fs from 'fs';

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
  ): Promise<vscode.DebugConfiguration | undefined> {
    // Make sure the config exists and is for our debug type
    if (!config.type || config.type !== "kotlin") {
      return config;
    }

    // Inject aspect args so that required outputs are generated when LSP builds stuff on its end
    if (!config.buildFlags) {
      const aspectArgs = await getBazelAspectArgs(
        this.aspectSourcesPath,
        false
      );
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

    if(config.javaVersion) {
      const javaHome = await findJavaHome(config.javaVersion);
      config.javaHome = javaHome;
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

    Object.keys(process.env).forEach((key) => {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key] as string;
      }
    });


    const additionalEnvVars = session.configuration.envVars as { [key: string]: string } 
    const actualEnv = {...env, ...additionalEnvVars};

    return new vscode.DebugAdapterExecutable(
      debugAdapterPath!,
      debugAdapterArgs,
      { env: actualEnv }
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
          "kotlin-language-server-bazel-support",
          this.config.version,
          this.config.installPath,
          progress
        );
      }
    );
    fs.chmodSync(
        path.join(this.config.installPath, "adapter", "bin", "kotlin-debug-adapter"),
        0o755
    );
    return path.join(this.config.installPath, "adapter", "bin", "kotlin-debug-adapter");
  }
}
