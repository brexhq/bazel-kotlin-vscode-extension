import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as https from 'https';
import * as yauzl from 'yauzl';
import { Progress } from 'vscode';

export function getGithubToken(): string {
    const tokenFile = path.join(os.homedir(), '.config', 'hub');
    if (!fs.existsSync(tokenFile)) {
        throw new Error('Github token file not found');
    }
    const token = fs.readFileSync(tokenFile, 'utf8');
    return token.trim();
}

export function getLanguageServerVersion(installationPath: string): string|null {
    const versionFile = path.join(installationPath, 'version');
    if (!fs.existsSync(versionFile)) {
        return null;
    }
    const version = fs.readFileSync(versionFile, 'utf8');
    return version.trim();
}

async function downloadFile(url: string): Promise<Buffer> {
    const token = getGithubToken();
    
    const options = {
        headers: {
            'User-Agent': 'brex-vscode-extension',
            'Authorization': `token ${token}`,
            'Accept': 'application/octet-stream'
        }
    };

    const response = await fetch(url, options);

    // Handle redirects
    if (response.status === 302 || response.status === 301) {
        const redirectUrl = response.headers.get('location');
        if (redirectUrl) {
            return await downloadFile(redirectUrl);
        }
    }

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

async function extractZip(zipBuffer: Buffer, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, async (err: Error | null, zipfile: yauzl.ZipFile) => {
            if (err) throw err;

            try {
                for await (const entry of streamZipEntries(zipfile)) {
                    const entryPath = path.join(destPath, entry.fileName);
                    const entryDir = path.dirname(entryPath);

                    await fs.promises.mkdir(entryDir, { recursive: true });

                    if (entry.fileName.endsWith('/')) continue;

                    const readStream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
                        zipfile.openReadStream(entry, (err, stream) => {
                            if (err) reject(err);
                            else if (!stream) reject(new Error('No read stream available'));
                            else resolve(stream);
                        });
                    });

                    const writeStream = fs.createWriteStream(entryPath);
                    await new Promise<void>((resolve, reject) => {
                        readStream.pipe(writeStream)
                            .on('finish', () => resolve())
                            .on('error', reject);
                    });
                }
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    });
}

// Helper function to convert zipfile entry events to async iterator
function streamZipEntries(zipfile: yauzl.ZipFile): AsyncIterableIterator<yauzl.Entry> {
    const iterator = {
        next(): Promise<IteratorResult<yauzl.Entry>> {
            return new Promise((resolve) => {
                zipfile.readEntry();
                zipfile.on('entry', (entry) => {
                    resolve({ value: entry, done: false });
                });
                zipfile.on('end', () => {
                    resolve({ value: undefined, done: true });
                });
            });
        },
        [Symbol.asyncIterator]() {
            return this;
        }
    };
    return iterator;
}

export async function downloadLanguageServer(
    installPath: string,
    version: string,
    progress: Progress<{ message: string }>
): Promise<void> {
    const token = getGithubToken();
    
    progress.report({ message: 'Finding Kotlin language server releases...' });
    
    const options = {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    };

    const response = await fetch('https://api.github.com/repos/brexhq/kotlin-language-server/releases', options);
    if (!response.ok) {
        throw new Error(`Failed to fetch releases: ${response.statusText}`);
    }

    interface GithubRelease {
        tag_name: string;
        assets: {
            name: string;
            url: string;
        }[];
    }
    const releases = await response.json() as GithubRelease[];
    const release = releases.find((r: any) => r.tag_name === version);
    if (!release) {
        throw new Error(`Release ${version} not found`);
    }

    const asset = release.assets.find((a: any) => a.name == 'kotlin-language-server.zip');
    if (!asset) {
        throw new Error('Could not find server.zip in release assets');
    }

    progress.report({ message: 'Downloading language server...' });
    const zipBuffer = await downloadFile(asset.url);

    progress.report({ message: 'Extracting language server...' });
    await extractZip(zipBuffer, installPath);

    await fs.promises.writeFile(path.join(installPath, 'version'), version);
    await fs.promises.chmod(path.join(installPath, 'server', 'bin', 'kotlin-language-server'), 0o755);
}
