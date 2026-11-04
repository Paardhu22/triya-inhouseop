/** Shared upload restrictions for all storage drivers and native clients. */
export const STORAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'application/pdf': 'pdf',
};
export function getStoragePolicy() {
  const configured = Number(process.env.STORAGE_MAX_FILE_MB ?? 10);
  const maxMb = Number.isFinite(configured) && configured > 0 ? configured : 10;
  // Leave room for multipart framing below Vercel's function request limit.
  const effectiveMb = Math.min(maxMb, process.env.VERCEL === "1" ? 3 : 10);
  return { maxFileBytes: Math.floor(effectiveMb * 1024 * 1024), allowedMimeTypes: Object.keys(STORAGE_MIME_EXTENSIONS) };
}
