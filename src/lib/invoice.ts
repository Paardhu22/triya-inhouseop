import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { format, parseISO } from "date-fns";
import { PDFDocument, type PDFFont, rgb } from "pdf-lib";

import type { InvoiceView } from "@/lib/invoice-compute";
import { embedUnicodeFonts } from "@/lib/pdf-font";
import { storage } from "@/lib/storage";

// pdf-lib's standard fonts use WinAnsi encoding, which cannot render the ₹ glyph,
// so amounts in the PDF use the ASCII-safe "Rs." prefix. (The WhatsApp body and the
// on-screen HTML preview are unicode and use ₹ normally.)
const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
function rs(paise: number): string {
  const rupees = paise / 100;
  return `Rs. ${paise % 100 === 0 ? inr.format(Math.round(rupees)) : inr.format(rupees)}`;
}

// Load the brand logo once. Falls back to a wordmark if the file is missing so a
// generation never hard-fails on a missing asset.
let logoBytesPromise: Promise<Uint8Array | null> | null = null;
function loadLogoBytes(): Promise<Uint8Array | null> {
  if (!logoBytesPromise) {
    logoBytesPromise = fs
      .readFile(path.join(process.cwd(), "public", "logo.png"))
      .then((b) => new Uint8Array(b))
      .catch(() => null);
  }
  return logoBytesPromise;
}

/**
 * The image to print in the header: the property's own uploaded logo (PNG/JPEG) when it
 * has one, otherwise the bundled Triya brand logo. Returns null so the caller can fall
 * back to a text wordmark, and never hard-fails on a missing/corrupt asset.
 */
async function embedHeaderLogo(pdf: PDFDocument, propertyLogoKey: string | null) {
  if (propertyLogoKey) {
    const file = await storage.read(propertyLogoKey);
    if (file) {
      try {
        if (file.mimeType === "image/png") return await pdf.embedPng(file.data);
        if (file.mimeType === "image/jpeg") return await pdf.embedJpg(file.data);
      } catch {
        // corrupt image — fall through to the brand logo
      }
    }
  }
  const brand = await loadLogoBytes();
  if (brand) {
    try {
      return await pdf.embedPng(brand);
    } catch {
      return null;
    }
  }
  return null;
}

const fmtDate = (iso: string) => format(parseISO(iso), "dd MMM yyyy");
const fmtMonth = (iso: string) => format(parseISO(iso), "MMMM yyyy");

// A4, points, origin bottom-left.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const LEFT = 50;
const RIGHT = 545;

const INK = rgb(0.11, 0.12, 0.15);
const MUTED = rgb(0.46, 0.48, 0.53);
const LINE = rgb(0.85, 0.86, 0.89);
const PANEL = rgb(0.965, 0.97, 0.98);

/** Render a clean A4 rent invoice from a shared InvoiceView and return PDF bytes. */
export async function generateInvoicePdf(data: InvoiceView): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const { regular: font, bold } = await embedUnicodeFonts(pdf);

  const text = (s: string, x: number, y: number, size: number, f = font, color = INK) =>
    page.drawText(s, { x, y, size, font: f, color });

  const textRight = (s: string, xRight: number, y: number, size: number, f = font, color = INK) =>
    page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y, size, font: f, color });

  const rule = (y: number, x1 = LEFT, x2 = RIGHT, color = LINE) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.75, color });

  // -- Header: logo (property's own, else brand) + property, invoice title ---
  const img = await embedHeaderLogo(pdf, data.propertyLogoKey);
  if (img) {
    const maxH = 40;
    const maxW = 160;
    let h = maxH;
    let w = (img.width / img.height) * h;
    if (w > maxW) {
      w = maxW;
      h = (img.height / img.width) * w;
    }
    page.drawImage(img, { x: LEFT, y: 812 - h, width: w, height: h });
  } else {
    text("Triya Manager", LEFT, 782, 20, bold);
  }

  textRight("RENT INVOICE", RIGHT, 792, 20, bold);
  textRight(`#${data.number}`, RIGHT, 776, 10, font, MUTED);

  text(data.propertyName, LEFT, 752, 12, bold);
  if (data.propertyAddress) text(data.propertyAddress, LEFT, 738, 9, font, MUTED);
  if (data.propertyPhone) text(`Phone: ${data.propertyPhone}`, LEFT, 726, 9, font, MUTED);

  rule(710);

  // -- Billed-to (left) + invoice details (right) ---------------------------
  text("BILLED TO", LEFT, 690, 8, bold, MUTED);
  text(data.tenantName, LEFT, 674, 12, bold);
  text(`Phone: ${data.tenantPhone}`, LEFT, 659, 9, font, MUTED);
  text(`Joined: ${fmtDate(data.dateOfJoining)}`, LEFT, 646, 9, font, MUTED);
  text(`Room ${data.roomNumber} · Bed ${data.bedLabel}`, LEFT, 633, 9, font, MUTED);

  const metaLabelX = 350;
  const meta: Array<[string, string]> = [
    ["Invoice Date", fmtDate(data.issueDate)],
    ["Billing Month", fmtMonth(data.billingMonth)],
    ["Due Date", data.dueDate ? fmtDate(data.dueDate) : "—"],
    ["Status", data.paymentStatusLabel],
  ];
  let my = 690;
  for (const [label, value] of meta) {
    text(label, metaLabelX, my, 9, font, MUTED);
    textRight(value, RIGHT, my, 9, value === data.paymentStatusLabel ? bold : font);
    my -= 15;
  }

  rule(612);

  // -- Charges table --------------------------------------------------------
  text("DESCRIPTION", LEFT, 592, 8, bold, MUTED);
  textRight("AMOUNT", RIGHT, 592, 8, bold, MUTED);
  rule(584);

  let y = 562;
  const row = (label: string, amount: string, opts?: { bold?: boolean }) => {
    const f = opts?.bold ? bold : font;
    text(label, LEFT, y, 11, f);
    textRight(amount, RIGHT, y, 11, f);
    y -= 23;
  };

  row("Rent", rs(data.rentPaise));
  row("Maintenance", rs(data.maintenancePaise));
  if (data.previousDuePaise > 0) row("Previous Due", rs(data.previousDuePaise));
  if (data.extraChargesPaise > 0) {
    row(data.extraChargesLabel?.trim() || "Extra Charges", rs(data.extraChargesPaise));
  }
  if (data.discountPaise > 0) row("Discount", `- ${rs(data.discountPaise)}`);

  rule(y + 10);
  y -= 4;

  // Subtotal
  text("Subtotal", LEFT, y, 11, font, MUTED);
  textRight(rs(data.subtotalPaise), RIGHT, y, 11, font, MUTED);
  y -= 30;

  // Total Due, in a soft panel
  const boxH = 30;
  page.drawRectangle({
    x: LEFT,
    y: y - 9,
    width: RIGHT - LEFT,
    height: boxH,
    color: PANEL,
    borderColor: LINE,
    borderWidth: 0.75,
  });
  text("Total Due", LEFT + 12, y, 13, bold);
  textRight(rs(data.totalPaise), RIGHT - 12, y, 14, bold);

  // -- Notes (optional) -----------------------------------------------------
  if (data.notes?.trim()) {
    let ny = y - 44;
    text("NOTES", LEFT, ny, 8, bold, MUTED);
    ny -= 14;
    for (const line of wrap(data.notes.trim(), font, 9, RIGHT - LEFT)) {
      text(line, LEFT, ny, 9, font, MUTED);
      ny -= 12;
    }
  }

  // -- Footer ---------------------------------------------------------------
  rule(96);
  text("Thank you for staying with us. Please pay before the due date.", LEFT, 80, 10, font, INK);
  textRight("Generated by Triya Manager", RIGHT, 80, 8, font, MUTED);

  return pdf.save();
}

/** Greedy word-wrap to a pixel width for a given font/size. */
function wrap(s: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = s.replace(/\s+/g, " ").split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4); // cap so notes never overrun the footer
}
