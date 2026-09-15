// Turning raw sheet rows into coerced values, with a per-row list of what went wrong.
// Pure — the mapping step previews single cells with this, and the server resolver
// runs the identical pass over the whole sheet before it touches the database, so the
// browser and the server can never disagree about what a cell means.
import type { PaymentMethod } from "@/generated/prisma/client";

import {
  cleanCell,
  isBlank,
  normalizePhone,
  parseEmail,
  parseFlexibleDate,
  parseInteger,
  parseMonthStart,
  parsePaymentMethod,
  parsePaymentStatus,
  parseRupees,
  parseSharingType,
  type Coerced,
} from "./coerce";
import { fieldDef, kindDef } from "./fields";
import type { ColumnMapping, FieldDef, ImportKind } from "./types";

export type PhoneValue = { stored: string; key: string };

/** Every shape a coerced cell can take. Which one applies is set by FieldDef.type. */
export type CellValue = string | number | Date | PhoneValue | null;

export type CoercedRow = {
  /** The row number in the user's own spreadsheet, header and title rows included. */
  rowNumber: number;
  /** Every mapped cell was empty — ignored silently rather than reported as an error. */
  blank: boolean;
  values: Record<string, CellValue>;
  errors: string[];
};

/** Longest text we keep from a cell; guards against a stray paragraph in a notes column. */
const MAX_TEXT = 500;

/** Coerce one raw cell according to its field definition. */
export function coerceCell(field: FieldDef, raw: string): Coerced<CellValue> {
  switch (field.type) {
    case "text":
      return { ok: true, value: cleanCell(raw).slice(0, MAX_TEXT) };
    case "phone":
      return normalizePhone(raw);
    case "email":
      return parseEmail(raw);
    case "money":
      return parseRupees(raw);
    case "date":
      return parseFlexibleDate(raw);
    case "month":
      return parseMonthStart(raw);
    case "int":
      return parseInteger(raw, field.min ?? 0, field.max ?? 1_000_000);
    case "paymentStatus":
      return parsePaymentStatus(raw);
    case "paymentMethod":
      return parsePaymentMethod(raw);
    case "sharing":
      return parseSharingType(raw);
  }
}

/**
 * Coerce every mapped cell of one row. A blank optional cell yields null without
 * complaint; a blank required cell, or one that cannot be read, becomes a row error
 * phrased for someone looking at their own spreadsheet.
 */
export function coerceRow(kind: ImportKind, mapping: ColumnMapping, row: string[], rowNumber: number): CoercedRow {
  const fields = kindDef(kind).fields;
  const values: Record<string, CellValue> = {};
  const errors: string[] = [];
  let sawValue = false;

  for (const field of fields) {
    const column = mapping[field.key];
    if (column === undefined) continue;

    const raw = row[column] ?? "";
    if (isBlank(raw)) {
      values[field.key] = null;
      if (field.required) errors.push(`${field.label} is required`);
      continue;
    }
    sawValue = true;

    const result = coerceCell(field, raw);
    if (result.ok) {
      values[field.key] = result.value;
    } else {
      values[field.key] = null;
      errors.push(`${field.label} ${result.error}`);
    }
  }

  // A row where every mapped column is empty is trailing spreadsheet noise, not a
  // mistake — report it as blank and drop the "required" complaints it collected.
  if (!sawValue) return { rowNumber, blank: true, values, errors: [] };

  return { rowNumber, blank: false, values, errors };
}

/** `firstDataRow` is the spreadsheet row number of `rows[0]` (see ParsedSheet). */
export function coerceRows(
  kind: ImportKind,
  mapping: ColumnMapping,
  rows: string[][],
  firstDataRow: number,
): CoercedRow[] {
  return rows.map((row, index) => coerceRow(kind, mapping, row, firstDataRow + index));
}

// ---------------------------------------------------------------------------
// Typed readers. The resolver pulls values out through these rather than casting,
// so a field catalogue change can never silently hand it the wrong shape.
// ---------------------------------------------------------------------------

export function readText(row: CoercedRow, key: string): string | null {
  const value = row.values[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readNumber(row: CoercedRow, key: string): number | null {
  const value = row.values[key];
  return typeof value === "number" ? value : null;
}

export function readDate(row: CoercedRow, key: string): Date | null {
  const value = row.values[key];
  return value instanceof Date ? value : null;
}

export function readPhone(row: CoercedRow, key: string): PhoneValue | null {
  const value = row.values[key];
  if (value && typeof value === "object" && !(value instanceof Date) && "stored" in value) return value;
  return null;
}

export function readPaymentStatus(row: CoercedRow, key: string): "PAID" | "PENDING" | null {
  const value = row.values[key];
  return value === "PAID" || value === "PENDING" ? value : null;
}

export function readPaymentMethod(row: CoercedRow, key: string): PaymentMethod | null {
  const value = row.values[key];
  return value === "CASH" || value === "ONLINE" || value === "SPLIT" ? value : null;
}

// ---------------------------------------------------------------------------
// Mapping-step preview
// ---------------------------------------------------------------------------

export type CellPreview = { ok: boolean; text: string };

/** How a sample cell will be read, rendered for the mapping table. */
export function previewCell(kind: ImportKind, fieldKey: string, raw: string): CellPreview {
  const field = fieldDef(kind, fieldKey);
  if (!field) return { ok: false, text: "—" };
  if (isBlank(raw)) return { ok: !field.required, text: "—" };

  const result = coerceCell(field, raw);
  if (!result.ok) return { ok: false, text: result.error };
  return { ok: true, text: describeValue(field, result.value) };
}

/** Render a coerced value the way the preview should show it back to the user. */
export function describeValue(field: FieldDef, value: CellValue): string {
  if (value === null) return "—";
  if (value instanceof Date) {
    return field.type === "month"
      ? value.toLocaleDateString("en-IN", { month: "long", year: "numeric" })
      : value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  if (typeof value === "number") {
    // Money is held in paise; everything else numeric is a plain count.
    return field.type === "money" ? `₹${(value / 100).toLocaleString("en-IN")}` : String(value);
  }
  if (typeof value === "string") return value;
  return value.stored;
}
