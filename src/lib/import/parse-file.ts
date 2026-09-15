import "server-only";

// Reading whatever the user hands us into a plain grid of strings. Deliberately
// stringifies every cell: all interpretation happens later in coerce.ts, so a parsing
// library never gets to decide on its own whether 03/04/2024 is March or April.
import ExcelJS from "exceljs";
import Papa from "papaparse";

import { MAX_IMPORT_ROWS, type ParsedSheet } from "./types";

export class ImportParseError extends Error {}

/** Spreadsheet-style name for an unlabelled column: 0 -> A, 26 -> AA. */
function columnLetter(index: number): string {
  let name = "";
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** Whatever ExcelJS put in a cell, as the text a person would see in the sheet. */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // A real date: hand downstream an unambiguous ISO day, never a locale rendering.
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("");
    }
    if ("formula" in value || "sharedFormula" in value) {
      const result = (value as ExcelJS.CellFormulaValue).result;
      return result === undefined ? "" : cellToString(result as ExcelJS.CellValue);
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("error" in value) return "";
  }
  return "";
}

/**
 * Square the grid off to its widest meaningful column and drop the empty rows at the
 * end. Blank rows in the MIDDLE are deliberately kept: every row number the importer
 * reports back is the row number in the user's own spreadsheet, and silently removing
 * a row here would shift every number below it.
 */
function tidyGrid(grid: string[][]): string[][] {
  let width = 0;
  for (const row of grid) {
    for (let index = row.length - 1; index >= 0; index -= 1) {
      if (row[index]?.trim()) {
        width = Math.max(width, index + 1);
        break;
      }
    }
  }
  if (width === 0) return [];

  let last = grid.length;
  while (last > 0 && !grid[last - 1].some((cell) => cell?.trim())) last -= 1;

  return grid
    .slice(0, last)
    .map((row) => Array.from({ length: width }, (_, index) => (row[index] ?? "").toString()));
}

/**
 * Which row holds the column headings. Registers often open with a merged title like
 * "FRIEDEN PG — RESIDENT LIST", so prefer the first row carrying at least two filled
 * cells and only fall back to the first filled row if none does.
 */
function pickHeaderRow(grid: string[][]): number {
  const limit = Math.min(grid.length, 10);
  for (let index = 0; index < limit; index += 1) {
    if (grid[index].filter((cell) => cell.trim()).length >= 2) return index;
  }
  return 0;
}

/** Split a tidied grid into named headers plus capped data rows. */
function toSheet(name: string, grid: string[][]): ParsedSheet {
  const tidy = tidyGrid(grid);
  if (tidy.length === 0) return { name, headers: [], rows: [], truncated: 0, firstDataRow: 2 };

  const headerIndex = pickHeaderRow(tidy);
  const headers = tidy[headerIndex].map((cell, index) => cell.trim() || `Column ${columnLetter(index)}`);
  const all = tidy.slice(headerIndex + 1);
  const rows = all.slice(0, MAX_IMPORT_ROWS);

  return {
    name,
    headers,
    rows,
    truncated: all.length - rows.length,
    // 1-based spreadsheet row of rows[0]: the header row, plus one, in 1-based terms.
    firstDataRow: headerIndex + 2,
  };
}

/** Parse CSV / TSV text, letting Papa sniff the delimiter (a paste from Excel is tab-separated). */
function parseDelimited(name: string, text: string): ParsedSheet {
  const result = Papa.parse<string[]>(text, {
    header: false,
    // Blank lines are kept so row numbers still line up with the user's file; tidyGrid
    // trims the trailing ones and squares up the ragged rows hand-kept sheets are full of.
    skipEmptyLines: false,
    delimiter: "",
  });
  const fatal = result.errors.find((error) => error.type === "Delimiter");
  if (fatal && result.data.length === 0) {
    throw new ImportParseError("Could not work out how that file is separated. Save it as a CSV and try again.");
  }
  return toSheet(name, result.data);
}

async function parseWorkbook(buffer: ArrayBuffer): Promise<ParsedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ImportParseError("That Excel file could not be opened. Try re-saving it as .xlsx or CSV.");
  }

  const sheets: ParsedSheet[] = [];
  workbook.eachSheet((worksheet) => {
    const grid: string[][] = [];
    const width = worksheet.columnCount;
    for (let rowIndex = 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
      const row = worksheet.getRow(rowIndex);
      grid.push(Array.from({ length: width }, (_, column) => cellToString(row.getCell(column + 1).value)));
    }
    sheets.push(toSheet(worksheet.name || `Sheet ${sheets.length + 1}`, grid));
  });

  const withData = sheets.filter((sheet) => sheet.headers.length > 0);
  if (withData.length === 0) throw new ImportParseError("That workbook has no readable sheets.");
  return withData;
}

/** The old binary .xls container starts with the OLE2 magic number. */
function isLegacyXls(bytes: Uint8Array): boolean {
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

const LEGACY_XLS_MESSAGE =
  "That is an old-format .xls file. Open it in Excel and use Save As to make a .xlsx or CSV, then upload that.";

/** Read an uploaded file into one sheet per worksheet. */
export async function parseImportFile(file: File): Promise<ParsedSheet[]> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 8));

  if (name.endsWith(".xls") || isLegacyXls(bytes)) throw new ImportParseError(LEGACY_XLS_MESSAGE);

  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) return parseWorkbook(buffer);
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    return [parseDelimited(file.name, new TextDecoder().decode(buffer))];
  }

  // Unknown extension: a ZIP magic number means it is really an xlsx, otherwise try text.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return parseWorkbook(buffer);
  return [parseDelimited(file.name || "Pasted data", new TextDecoder().decode(buffer))];
}

/** Read a block of text pasted straight out of Excel or Google Sheets. */
export function parseImportText(text: string): ParsedSheet[] {
  if (!text.trim()) throw new ImportParseError("Nothing was pasted.");
  return [parseDelimited("Pasted data", text)];
}
