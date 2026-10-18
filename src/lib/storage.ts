import "server-only";
import { getStoragePolicy, STORAGE_MIME_EXTENSIONS } from "@/lib/storage-policy";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

const ALLOWED_TYPES = STORAGE_MIME_EXTENSIONS;
const { maxFileBytes } = getStoragePolicy();

function validateAndBuildKey(file: File, prefix: string): string {
  if (file.size === 0) throw new Error("Empty file");
  if (file.size > maxFileBytes) {
    throw new Error(`File exceeds the ${maxFileBytes / 1024 / 1024}MB limit`);
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new Error("Unsupported file type");
  return `${prefix}/${randomUUID()}.${ext}`;
}

function mimeTypeForExt(extWithOrWithoutDot: string): string {
  const ext = extWithOrWithoutDot.replace(/^\./, "").toLowerCase();
  return (
    Object.entries(ALLOWED_TYPES).find(([, e]) => e === ext)?.[0] ??
    "application/octet-stream"
  );
}

// ---------------------------------------------------------------------------
// Local disk driver. Files live outside the web root and are served only via
// the authenticated /api/files route.
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
    const key = validateAndBuildKey(file, prefix);
    const full = resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, Buffer.from(await file.arrayBuffer()));

    return { key, filename: file.name, mimeType: file.type, size: file.size };
  },

  async read(key) {
    try {
      const full = resolveKey(key);
      const data = await fs.readFile(full);
      const mimeType = mimeTypeForExt(path.extname(full));
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

// ---------------------------------------------------------------------------
// Supabase Storage driver. Used in serverless production (Vercel + Supabase)
// or whenever STORAGE_DRIVER="supabase".
// ---------------------------------------------------------------------------
let cachedSupabase: SupabaseClient | null = null;

function getSupabaseStorageClient(): { client: SupabaseClient; bucket: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase Storage requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
    );
  }
  if (!cachedSupabase) {
    cachedSupabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "triya-uploads";
  return { client: cachedSupabase, bucket };
}

function normalizeStorageKey(key: string): string {
  const cleaned = path.posix.normalize(key).replace(/^\/+/, "");
  if (!cleaned || cleaned.startsWith("..") || cleaned.includes("/../")) {
    throw new Error("Invalid storage key");
  }
  return cleaned;
}

const supabaseDriver: StorageDriver = {
  async save(file, prefix = "uploads") {
    const key = validateAndBuildKey(file, prefix);
    const { client, bucket } = getSupabaseStorageClient();
    const bytes = Buffer.from(await file.arrayBuffer());

    let { error } = await client.storage.from(bucket).upload(key, bytes, {
      contentType: file.type,
      upsert: false,
    });

    if (error && /bucket not found/i.test(error.message)) {
      await client.storage.createBucket(bucket, { public: false });
      const retry = await client.storage.from(bucket).upload(key, bytes, {
        contentType: file.type,
        upsert: false,
      });
      error = retry.error;
    }

    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    return { key, filename: file.name, mimeType: file.type, size: file.size };
  },

  async read(key) {
    try {
      const safeKey = normalizeStorageKey(key);
      const { client, bucket } = getSupabaseStorageClient();
      const { data, error } = await client.storage.from(bucket).download(safeKey);
      if (error || !data) return null;
      const buffer = Buffer.from(await data.arrayBuffer());
      const mimeType = mimeTypeForExt(path.posix.extname(safeKey));
      return { data: buffer, mimeType };
    } catch {
      return null;
    }
  },

  async remove(key) {
    try {
      const safeKey = normalizeStorageKey(key);
      const { client, bucket } = getSupabaseStorageClient();
      await client.storage.from(bucket).remove([safeKey]);
    } catch {
      // Ignore missing files.
    }
  },
};

function selectDriver(): StorageDriver {
  const configured = process.env.STORAGE_DRIVER?.toLowerCase();
  if (configured === "supabase") return supabaseDriver;
  if (configured === "local" && !process.env.VERCEL) return localDriver;
  if (process.env.VERCEL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return supabaseDriver;
  }
  return localDriver;
}

export const storage: StorageDriver = selectDriver();
