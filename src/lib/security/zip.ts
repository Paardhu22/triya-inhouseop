import { inflateRawSync } from "node:zlib";

/** Validate and decompress within hard bounds BEFORE ExcelJS loads an XLSX archive. */
export function validateWorkbookArchive(bytes: Buffer): void {
  const maxEntryBytes = 8 * 1024 * 1024;
  const maxTotalBytes = 24 * 1024 * 1024;
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50 && at + 22 + bytes.readUInt16LE(at + 20) === bytes.length) { end = at; break; }
  }
  if (end < 0) throw new Error("Invalid workbook archive");
  const entries = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  const directoryAt = bytes.readUInt32LE(end + 16);
  if (!entries || entries > 2048 || directoryAt + directorySize !== end || bytes.readUInt32LE(end + 4) !== 0) {
    throw new Error("Workbook archive is too complex or unsupported");
  }
  let at = directoryAt, total = 0;
  for (let index = 0; index < entries; index++) {
    if (at + 46 > end || bytes.readUInt32LE(at) !== 0x02014b50) throw new Error("Invalid workbook directory");
    const flags = bytes.readUInt16LE(at + 8), method = bytes.readUInt16LE(at + 10);
    const compressed = bytes.readUInt32LE(at + 20), expanded = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28), extraLength = bytes.readUInt16LE(at + 30), commentLength = bytes.readUInt16LE(at + 32);
    const local = bytes.readUInt32LE(at + 42);
    if (flags & 1 || ![0, 8].includes(method) || expanded > maxEntryBytes || total + expanded > maxTotalBytes) {
      throw new Error("Workbook expands beyond the safe import limit");
    }
    if (local + 30 > directoryAt || bytes.readUInt32LE(local) !== 0x04034b50) throw new Error("Invalid workbook entry");
    const dataAt = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (dataAt + compressed > directoryAt) throw new Error("Invalid workbook entry size");
    const compressedData = bytes.subarray(dataAt, dataAt + compressed);
    // Do not trust declared sizes: stop actual decompression at the byte ceiling.
    const data = method === 8 ? inflateRawSync(compressedData, { maxOutputLength: maxEntryBytes }) : compressedData;
    if (data.length !== expanded) throw new Error("Invalid workbook expanded size");
    total += data.length;
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (at !== end) throw new Error("Invalid workbook directory size");
}
