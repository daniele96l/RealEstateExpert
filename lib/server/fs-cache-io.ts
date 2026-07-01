import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

function isReadOnlyFsError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "EROFS" || code === "EACCES";
}

/** Vercel and similar platforms mount the deployment bundle read-only. */
export function isServerCacheReadOnly(): boolean {
  return process.env.VERCEL === "1";
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  if (isServerCacheReadOnly()) return;

  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    if (isReadOnlyFsError(err)) return;
    throw err;
  }
}
