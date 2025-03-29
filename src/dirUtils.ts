import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

export async function deleteDirectoryContents(directory: string): Promise<void> {
  try {
    const items: string[] = await fsp.readdir(directory);
    
    for (const item of items) {
      const itemPath: string = path.join(directory, item);
      const stats: fs.Stats = await fsp.stat(itemPath);
      
      if (stats.isDirectory()) {
        await deleteDirectoryContents(itemPath);
        await fsp.rmdir(itemPath);
      } else {
        await fsp.unlink(itemPath);
      }
    }
  } catch (err) {
    console.error(`Error while deleting directory contents: ${(err as Error).message}`);
  }
}

export async function checkDirectoryExists(path: string) {
  try {
    const stats = await fsp.stat(path);
    return stats.isDirectory();
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // Directory does not exist
      return false;
    }
    throw error; // Some other error occurred
  }
}

export function touchFileSync(filePath: string): void {
  try {
    // Check if file exists
    fs.accessSync(filePath);

    // File exists, update timestamps
    const currentTime = new Date();
    fs.utimesSync(filePath, currentTime, currentTime);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      // File doesn't exist, create it
      fs.writeFileSync(filePath, "");
    } else {
      // Re-throw unexpected errors
      throw error;
    }
  }
}