import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";

// pdf-lib's built-in StandardFonts use WinAnsi encoding and THROW on any character
// outside CP-1252 (Telugu/Hindi/Devanagari, emoji, ₹, …). We embed a Unicode TTF
// (DejaVu Sans) via fontkit instead, so arbitrary tenant/vendor/notes text renders —
// or degrades to a blank glyph — without ever crashing PDF generation.
const FONT_DIR = path.join(process.cwd(), "src", "assets", "fonts");

let regularBytesPromise: Promise<Buffer> | null = null;
let boldBytesPromise: Promise<Buffer> | null = null;

/**
 * Register fontkit and embed the Unicode regular + bold faces into a document.
 * Call once per PDF; the font bytes are read from disk once and cached.
 */
export async function embedUnicodeFonts(
  pdf: PDFDocument,
): Promise<{ regular: PDFFont; bold: PDFFont }> {
  pdf.registerFontkit(fontkit);
  regularBytesPromise ??= fs.readFile(path.join(FONT_DIR, "DejaVuSans.ttf"));
  boldBytesPromise ??= fs.readFile(path.join(FONT_DIR, "DejaVuSans-Bold.ttf"));
  const [regularBytes, boldBytes] = await Promise.all([regularBytesPromise, boldBytesPromise]);
  const [regular, bold] = await Promise.all([
    pdf.embedFont(regularBytes, { subset: true }),
    pdf.embedFont(boldBytes, { subset: true }),
  ]);
  return { regular, bold };
}
