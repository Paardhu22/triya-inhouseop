/** Shared upload restrictions for all storage drivers and native clients. */
export const STORAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'application/pdf': 'pdf',
};
export function getStoragePolicy() {
  const configured = Number(process.env.STORAGE_MAX_FILE_MB ?? 10);
  const maxMb = Number.isFinite(configured) && configured > 0 ? configured : 10;
  return { maxFileBytes: Math.floor(maxMb * 1024 * 1024), allowedMimeTypes: Object.keys(STORAGE_MIME_EXTENSIONS) };
}
