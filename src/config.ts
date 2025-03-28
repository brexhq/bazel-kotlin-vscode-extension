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
    extensionSourcesPath: string;
    buildFlags: string[];
}

export class ConfigurationManager {
    private static readonly SECTION = 'bazelKLS';
    private languageServerInstallPath: string;
    private config: vscode.WorkspaceConfiguration;
    private extensionSourcesPath: string;

    constructor(storagePath: string) {
        this.languageServerInstallPath = path.join(storagePath, 'languageServer');
        this.extensionSourcesPath = path.join(storagePath, 'extensionSources');
        this.config = vscode.workspace.getConfiguration(ConfigurationManager.SECTION);
    }

    getConfig(): BazelKLSConfig {
        return {
                enabled: this.config.get('enabled', true),
                jvmTarget: this.config.get('jvmTarget', '11'),
                jvmOpts: this.config.get('jvmOpts', []),
                languageServerInstallPath: this.languageServerInstallPath,
                languageServerVersion: this.config.get('languageServerVersion', 'v1.3.14-bazel'),
                javaHome: this.config.get('javaHome', ''),
                languageServerLocalPath: this.config.get('path', null),
                debugAttachEnabled: this.config.get('debugAttach.enabled', false),
                debugAttachPort: this.config.get('debugAttach.port', 5009),
                extensionSourcesPath: this.extensionSourcesPath,
                buildFlags: this.config.get("buildFlags", []),
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
