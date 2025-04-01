import * as vscode from 'vscode';
import * as path from 'path';

export interface BazelKLSConfig {
    enabled: boolean;
    jvmTarget: string;
    jvmOpts: string[];
    languageServerInstallPath: string;
    languageServerVersion: string;
    javaHome: string;
    languageServerLocalPath: string | null;
    debugAttachEnabled: boolean;
    debugAttachPort: number;
    aspectSourcesPath: string;
    buildFlags: string[];
    debugAdapter: BazelKotlinDebugAdapterConfig
}

export interface BazelKotlinDebugAdapterConfig {
    enabled: boolean;
    installPath: string;
    path: string | undefined;
    version: string
}

export class ConfigurationManager {
    private static readonly SECTION = 'bazelKLS';
    private languageServerInstallPath: string;
    private config: vscode.WorkspaceConfiguration;
    private aspectSourcesPath: string;
    private debugAdapterInstallPath: string;

    constructor(storagePath: string) {
        this.languageServerInstallPath = path.join(storagePath, 'languageServer');
        this.aspectSourcesPath = path.join(storagePath, 'aspectSources');
        this.config = vscode.workspace.getConfiguration(ConfigurationManager.SECTION);
        this.debugAdapterInstallPath = path.join(storagePath, 'debugAdapter');
    }

    getConfig(): BazelKLSConfig {
        return {
                enabled: this.config.get('enabled', true),
                jvmTarget: this.config.get('jvmTarget', '11'),
                jvmOpts: this.config.get('jvmOpts', []),
                languageServerInstallPath: this.languageServerInstallPath,
                languageServerVersion: this.config.get('languageServerVersion', 'v1.3.16-bazel'),
                javaHome: this.config.get('javaHome', ''),
                languageServerLocalPath: this.config.get('path', null),
                debugAttachEnabled: this.config.get('debugAttach.enabled', false),
                debugAttachPort: this.config.get('debugAttach.port', 5009),
                aspectSourcesPath: this.aspectSourcesPath,
                buildFlags: this.config.get("buildFlags", []),
                debugAdapter: {
                    enabled: this.config.get('debugAdapter.enabled', false),
                    installPath: this.debugAdapterInstallPath,
                    path: this.config.get('debugAdapter.path', undefined),
                    version: this.config.get('debugAdapter.version', 'v1.3.15-bazel'),
                }
        };
    }

    public async update(settings: Partial<BazelKLSConfig>): Promise<void> {
        for (const [key, value] of Object.entries(settings)) {
            await this.config.update(key, value, vscode.ConfigurationTarget.Global);
        }
    }

    public onDidChangeConfiguration(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ConfigurationManager.SECTION)) {
                callback(e);
            }
        });
    }
}
