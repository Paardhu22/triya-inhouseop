// CSV writing for the importer: the blank templates staff can fill in, and the
// "download the rows that failed" file. Pure, so both the API route and the browser
// can call it.
import { kindDef } from "./fields";
import type { ImportKind, ResolvedRow } from "./types";

/** Quote a CSV field only when it needs it, and escape embedded quotes. */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Join rows into a CSV document. CRLF endings, which is what Excel expects. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * A starter sheet for one import kind: the column headings we recognise, plus a single
 * example row so the expected format of each cell is obvious. Generated from the field
 * catalogue, so it can never describe a column the importer does not actually accept.
 */
export function templateCsv(kind: ImportKind): string {
  const fields = kindDef(kind).fields;
  return toCsv([
    fields.map((field) => (field.required ? `${field.label} *` : field.label)),
    fields.map((field) => field.example),
  ]);
}

export function templateFilename(kind: ImportKind): string {
  return `triya-${kind}-template.csv`;
}

/** The rows that did not import, as a CSV the user can work through and re-upload. */
export function problemsCsv(rows: ResolvedRow[]): string {
  return toCsv([
    ["Sheet row", "Outcome", "Row", "Reason"],
    ...rows.map((row) => [String(row.rowNumber), row.status, row.label, row.message]),
  ]);
}
