/** Never trust the Content-Type supplied by an uploading browser/client. */
export function validFileSignature(bytes: Uint8Array, mimeType: string): boolean {
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  const ascii = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
  switch (mimeType) {
    case "image/png": return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/jpeg": return starts(0xff, 0xd8, 0xff);
    case "image/webp": return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
    case "image/heic": return ascii(4, 4) === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(ascii(8, 4));
    case "application/pdf": return ascii(0, 5) === "%PDF-";
    default: return false;
  }
}
