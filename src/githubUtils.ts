import * as path from "path";
import * as fs from "fs";
import * as yauzl from "yauzl";
import { Progress } from "vscode";
import {
  ASPECT_RELEASES,
  AspectReleaseInfo,
  KLS_RELEASE_ARCHIVE_SHA256,
} from "./constants";
import { deleteDirectoryContents } from "./dirUtils";

interface GithubRelease {
  tag_name: string;
  assets: {
    name: string;
    url: string;
    zipball_url: string;
  }[];
  zipball_url: string;
}

export function getLanguageServerVersion(
  installationPath: string
): string | null {
  const versionFile = path.join(installationPath, "version");
  if (!fs.existsSync(versionFile)) {
    return null;
  }
  const version = fs.readFileSync(versionFile, "utf8");
  return version.trim();
}

async function downloadFile(
  url: string,
  additionalHeaders: Record<string, string>,
  expectedSha256?: string
): Promise<Buffer> {
  const options = {
    headers: {
      "User-Agent": "bazel-kotlin-vscode-extension",
      ...additionalHeaders,
    },
  };

  const response = await fetch(url, options);

  // Handle redirects
  if (response.status === 302 || response.status === 301) {
    const redirectUrl = response.headers.get("location");
    if (redirectUrl) {
      return await downloadFile(redirectUrl, {
        Accept: "application/octet-stream",
      });
    }
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const fileBuffer = Buffer.from(await response.arrayBuffer());

  // Validate SHA256 if an expected hash was provided
  if (expectedSha256) {
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256");
    hash.update(fileBuffer);
    const actualSha256 = hash.digest("hex");

    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `SHA256 validation failed for ${url}. Expected: ${expectedSha256}, Actual: ${actualSha256}`
      );
    }
  }

  return fileBuffer;
}

function getBazelVersionFromAssetName(assetName: string): string {
  const version = assetName.split("-")[2].split(".")[0];
  return version[version.length - 1];
}

async function extractZip(zipBuffer: Buffer, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      zipBuffer,
      { lazyEntries: true },
      async (err: Error | null, zipfile: yauzl.ZipFile) => {
        if (err) {
          throw err;
        }

        try {
          for await (const entry of streamZipEntries(zipfile)) {
            const entryPath = path.join(destPath, entry.fileName);
            const entryDir = path.dirname(entryPath);

            await fs.promises.mkdir(entryDir, { recursive: true });

            if (entry.fileName.endsWith("/")) {
              continue;
            }

            const readStream = await new Promise<NodeJS.ReadableStream>(
              (resolve, reject) => {
                zipfile.openReadStream(entry, (err, stream) => {
                  if (err) {reject(err);}
                  else if (!stream)
                    {reject(new Error("No read stream available"));}
                  else {resolve(stream);}
                });
              }
            );

            const writeStream = fs.createWriteStream(entryPath);
            await new Promise<void>((resolve, reject) => {
              readStream
                .pipe(writeStream)
                .on("finish", () => resolve())
                .on("error", reject);
            });
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}

// Helper function to convert zipfile entry events to async iterator
function streamZipEntries(
  zipfile: yauzl.ZipFile
): AsyncIterableIterator<yauzl.Entry> {
  const iterator = {
    next(): Promise<IteratorResult<yauzl.Entry>> {
      return new Promise((resolve) => {
        zipfile.readEntry();
        zipfile.on("entry", (entry) => {
          resolve({ value: entry, done: false });
        });
        zipfile.on("end", () => {
          resolve({ value: undefined, done: true });
        });
      });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  return iterator;
}

export async function downloadLanguageServer(
  installPath: string,
  version: string,
  progress: Progress<{ message: string }>
): Promise<void> {
  progress.report({ message: "Finding Kotlin language server releases..." });

  const options = {
    headers: {
      Accept: "application/vnd.github.v3+json",
    },
  };

  const response = await fetch(
    "https://api.github.com/repos/smocherla-brex/kotlin-language-server-bazel-support/releases",
    options
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch releases: ${response.statusText}`);
  }

  const releases = (await response.json()) as GithubRelease[];
  const release = releases.find((r: any) => r.tag_name === version);
  if (!release) {
    throw new Error(`Release ${version} not found`);
  }

  const asset = release.assets.find(
    (a: any) => a.name == "kotlin-language-server.zip"
  );
  if (!asset) {
    throw new Error(
      "Could not find kotlin-language-server.zip in release assets"
    );
  }

  progress.report({ message: "Downloading language server..." });
  const zipBuffer = await downloadFile(
    asset.url,
    {
      Accept: "application/octet-stream",
    },
    KLS_RELEASE_ARCHIVE_SHA256[version]
  );

  progress.report({ message: "Extracting language server..." });
  await extractZip(zipBuffer, installPath);

  await fs.promises.writeFile(path.join(installPath, "version"), version);
  await fs.promises.chmod(
    path.join(installPath, "server", "bin", "kotlin-language-server"),
    0o755
  );
}

export async function downloadAspectReleaseArchive(
  repo: string,
  version: string,
  destPath: string,
  progress: Progress<{ message: string }>
): Promise<void> {
  if (fs.existsSync(path.join(destPath, "version"))) {
    const currentVersion = fs.readFileSync(
      path.join(destPath, "version"),
      "utf-8"
    );
    // if current version is the same, then skip download
    if (currentVersion == version) {
      progress.report({
        message: `aspect archive for ${version} already exists...`,
      });
      return;
    }
    await deleteDirectoryContents(destPath);
  }

  progress.report({ message: `Finding release ${version}...` });

  const options = {
    headers: {
      Accept: "application/vnd.github.v3+json",
    },
  };

  // Get release info
  const response = await fetch(
    `https://api.github.com/repos/smocherla-brex/${repo}/releases`,
    options
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch releases: ${response.statusText}`);
  }

  const releases = (await response.json()) as GithubRelease[];
  const release = releases.find((r) => r.tag_name === version);
  if (!release) {
    throw new Error(`Release ${version} not found`);
  }

  const assets = release.assets.filter((a) => a.name === "kls-aspect-bazel6.zip" || a.name === "kls-aspect-bazel7.zip" || a.name == "kls-aspect-bazel8.zip");
  if (!assets) {
    throw new Error("Could not find kls-aspect.zip in release assets");
  }

  for (const asset of assets) {
    const bazelVersion = getBazelVersionFromAssetName(asset.name);
    const aspectRelease = ASPECT_RELEASES.find((r: AspectReleaseInfo) => r.bazelVersion === bazelVersion);
    if (!aspectRelease) {
      throw new Error(`Could not find aspect release for bazel version ${bazelVersion}`);
    }
    const zipBuffer = await downloadFile(
      asset.url,
      {
        Accept: "application/octet-stream",
      },
      aspectRelease.sha256
    );
  
    // Extract archive
    progress.report({ message: "Extracting aspect for Kotlin LSP..." });
    await extractZip(zipBuffer, path.join(destPath, bazelVersion));
  }

  fs.writeFileSync(path.join(destPath, "version"), version);
}

export async function downloadDebugAdapter(
  repo: string,
  version: string,
  destPath: string,
  progress: Progress<{ message: string }>
): Promise<void> {
  if (fs.existsSync(path.join(destPath, "version"))) {
    const currentVersion = fs.readFileSync(
      path.join(destPath, "version"),
      "utf-8"
    );
    // if current version is the same, then skip download
    if (currentVersion == version) {
      progress.report({
        message: `debug adapter for ${version} already exists...`,
      });
      return;
    }
    await deleteDirectoryContents(destPath);
  }

  progress.report({ message: `Finding release ${version}...` });

  const options = {
    headers: {
      Accept: "application/vnd.github.v3+json",
    },
  };

  // Get release info
  const response = await fetch(
    `https://api.github.com/repos/smocherla-brex/${repo}/releases`,
    options
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch releases: ${response.statusText}`);
  }

  const releases = (await response.json()) as GithubRelease[];
  const release = releases.find((r) => r.tag_name === version);
  if (!release) {
    throw new Error(`Release ${version} not found`);
  }

  const asset = release.assets.find((a) => a.name === "kotlin-debug-adapter.zip");
  if (!asset) {
    throw new Error("Could not find kls-aspect.zip in release assets");
  }

  const zipBuffer = await downloadFile(
    asset.url,
    {
      Accept: "application/octet-stream",
    },
  );

  // Extract archive
  progress.report({ message: "Extracting debug adapter..." });
  await extractZip(zipBuffer, destPath);

  fs.writeFileSync(path.join(destPath, "version"), version);
}
