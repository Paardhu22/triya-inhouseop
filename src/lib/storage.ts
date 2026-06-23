import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type StoredFile = {
  key: string;
  filename: string;
  mimeType: string;
  size: number;
};

export interface StorageDriver {
  save(file: File, prefix?: string): Promise<StoredFile>;
  read(key: string): Promise<{ data: Buffer; mimeType: string } | null>;
  remove(key: string): Promise<void>;
}

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const MAX_MB = Number(process.env.STORAGE_MAX_FILE_MB ?? 10);

// ---------------------------------------------------------------------------
// Local disk driver. Files live outside the web root and are served only via
// the authenticated /api/files route. Swapping to S3/R2 means implementing the
// StorageDriver interface and pointing `storage` at the new driver.
// ---------------------------------------------------------------------------
function localBaseDir(): string {
  return path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? "./storage/uploads");
}

function resolveKey(key: string): string {
  const base = localBaseDir();
  const full = path.resolve(base, key);
  // Guard against path traversal.
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return full;
}

const localDriver: StorageDriver = {
  async save(file, prefix = "uploads") {
    if (file.size === 0) throw new Error("Empty file");
    if (file.size > MAX_MB * 1024 * 1024) {
      throw new Error(`File exceeds the ${MAX_MB}MB limit`);
    }
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) throw new Error("Unsupported file type");

    const key = `${prefix}/${randomUUID()}.${ext}`;
    const full = resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, Buffer.from(await file.arrayBuffer()));

    return { key, filename: file.name, mimeType: file.type, size: file.size };
  },

  async read(key) {
    try {
      const full = resolveKey(key);
      const data = await fs.readFile(full);
      const ext = path.extname(full).slice(1).toLowerCase();
      const mimeType =
        Object.entries(ALLOWED_TYPES).find(([, e]) => e === ext)?.[0] ??
        "application/octet-stream";
      return { data, mimeType };
    } catch {
      return null;
    }
  },

  async remove(key) {
    try {
      await fs.unlink(resolveKey(key));
    } catch {
      // Ignore missing files.
    }
  },
};

export const storage: StorageDriver = localDriver;
