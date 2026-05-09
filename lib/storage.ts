import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Simple local filesystem storage that replaces @vercel/blob.
// Files are stored under STORAGE_DIR (default: /data/ghost-storage).
// URL-accessible files are served through API routes.

const STORAGE_DIR = process.env.STORAGE_DIR ?? "/data/ghost-storage";

const ensureDir = async (filePath: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

const resolvePath = (pathname: string): string =>
  path.join(STORAGE_DIR, pathname);

/**
 * Store bytes at the given pathname. Returns the stored path.
 */
export const storagePut = async (
  pathname: string,
  data: Buffer | Uint8Array | string,
  _options?: { access?: string; addRandomSuffix?: boolean; contentType?: string; cacheControlMaxAge?: number }
): Promise<{ url: string; pathname: string }> => {
  let finalPathname = pathname;

  if (_options?.addRandomSuffix) {
    const ext = path.extname(pathname);
    const base = pathname.slice(0, -ext.length || undefined);
    const suffix = crypto.randomBytes(8).toString("hex");
    finalPathname = `${base}-${suffix}${ext}`;
  }

  const fullPath = resolvePath(finalPathname);
  await ensureDir(fullPath);
  await fs.writeFile(fullPath, data);

  return { url: fullPath, pathname: finalPathname };
};

/**
 * Read a file from storage. Returns the buffer and content type.
 */
export const storageGet = async (
  pathname: string,
  _options?: { access?: string; ifNoneMatch?: string }
): Promise<{
  stream: ReadableStream;
  blob: { contentType: string; etag: string };
  statusCode: number;
} | null> => {
  const fullPath = pathname.startsWith("/") ? pathname : resolvePath(pathname);
  try {
    const stat = await fs.stat(fullPath);
    const buffer = await fs.readFile(fullPath);
    const etag = `"${crypto.createHash("md5").update(buffer).digest("hex")}"`;

    if (_options?.ifNoneMatch === etag) {
      return {
        stream: new ReadableStream(),
        blob: { contentType: "application/octet-stream", etag },
        statusCode: 304,
      };
    }

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(buffer);
        controller.close();
      },
    });

    return {
      stream,
      blob: { contentType: guessContentType(fullPath), etag },
      statusCode: 200,
    };
  } catch {
    return null;
  }
};

/**
 * Delete a file from storage.
 */
export const storageDel = async (
  pathnameOrUrl: string
): Promise<void> => {
  const fullPath = pathnameOrUrl.startsWith("/")
    ? pathnameOrUrl
    : resolvePath(pathnameOrUrl);
  try {
    await fs.unlink(fullPath);
  } catch {
    // best-effort
  }
};

/**
 * Read raw bytes from storage (used by agent binary download).
 */
export const storageReadStream = async (
  pathnameOrUrl: string
): Promise<{ body: ReadableStream; size: number } | null> => {
  const fullPath = pathnameOrUrl.startsWith("/")
    ? pathnameOrUrl
    : resolvePath(pathnameOrUrl);
  try {
    const buffer = await fs.readFile(fullPath);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(buffer);
        controller.close();
      },
    });
    return { body: stream, size: buffer.length };
  } catch {
    return null;
  }
};

const guessContentType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".bin": "application/octet-stream",
    ".jar": "application/java-archive",
    ".zip": "application/zip",
  };
  return types[ext] ?? "application/octet-stream";
};
