// Shared vocabulary for the bulk importer. Pure types only — imported by the client
// wizard, the pure validators and the server-only resolver alike.

/** The four sheet shapes the importer understands. */
export type ImportKind = "tenants" | "structure" | "payments" | "expenses";

export const IMPORT_KINDS: ImportKind[] = ["tenants", "structure", "payments", "expenses"];

/**
 * How a mapped column is coerced. `text` is passed through trimmed; every other type
 * runs through the matching parser in `coerce.ts` and can fail with a row error.
 */
export type FieldType =
  | "text"
  | "phone"
  | "email"
  | "money"
  | "date"
  | "month"
  | "int"
  | "paymentStatus"
  | "paymentMethod"
  | "sharing";

export type FieldDef = {
  /** Stable key used in mappings and by the resolver. */
  key: string;
  label: string;
  required: boolean;
  type: FieldType;
  /** Header spellings recognised when guessing the mapping (normalised on compare). */
  aliases: string[];
  /** Shown under the field in the mapping step. */
  hint?: string;
  /** Sample value written into the downloadable template. */
  example: string;
  /** Bounds for `int` fields. */
  min?: number;
  max?: number;
};

export type KindDef = {
  kind: ImportKind;
  label: string;
  /** One line for the source-step card. */
  description: string;
  /** What a single row of this sheet represents. */
  rowMeaning: string;
  fields: FieldDef[];
  /**
   * Groups where at least one field must be mapped, even though each is individually
   * optional (payments accept either a phone or a room number to find the tenancy).
   */
  requireOneOf?: { label: string; keys: string[] }[];
};

/**
 * Which spreadsheet column feeds each of our fields: field key -> zero-based column
 * index. A field the user chose to skip simply has no entry. Indexes rather than
 * header names, so a sheet with two identically named columns still maps cleanly.
 */
export type ColumnMapping = Record<string, number>;

/** One worksheet (or one CSV / pasted block) read as raw strings. */
export type ParsedSheet = {
  name: string;
  headers: string[];
  rows: string[][];
  /** Data rows dropped because the sheet exceeded MAX_IMPORT_ROWS. */
  truncated: number;
  /**
   * The row number, as the user's spreadsheet counts them, of `rows[0]`. Sheets often
   * open with a title row, so this is not always 2 — every reported row number is
   * offset by it so it points at the right line of their file.
   */
  firstDataRow: number;
};

export type ParsedUpload = {
  sourceName: string;
  sheets: ParsedSheet[];
  /** Best guess at the sheet type, from the headers of the first sheet. */
  suggestedKind: ImportKind;
};

export type ImportOptions = {
  /** Create the floors / rooms / beds a tenants sheet refers to but the property lacks. */
  createMissingStructure: boolean;
  /** The deposit column is the gross amount collected, so hold back the ₹1000 reserve. */
  depositIsGross: boolean;
  /** Create expense categories / subcategories named in the sheet but not yet defined. */
  createMissingCategories: boolean;
};

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  createMissingStructure: false,
  depositIsGross: true,
  createMissingCategories: true,
};

/**
 * What will happen to one sheet row. `ready` rows are written on commit; `skip` rows
 * are deliberate no-ops (a resident already on file); `error` rows could not be
 * resolved and are reported back for the user to fix.
 */
export type RowStatus = "ready" | "skip" | "error";

export type ResolvedRow = {
  /** The row number in the user's own spreadsheet, header and title rows included. */
  rowNumber: number;
  status: RowStatus;
  /** Plain-language outcome: what will be created, or why it will not be. */
  message: string;
  /** A few identifying cells, so the preview table is readable without the sheet. */
  label: string;
};

export type ImportPreview = {
  rows: ResolvedRow[];
  ready: number;
  skipped: number;
  errored: number;
  /** Rows that were entirely blank and are ignored without comment. */
  blank: number;
};

export type ImportSummary = {
  imported: number;
  skipped: number;
  failed: number;
  /** What was written, e.g. [{ label: "Residents moved in", count: 42 }]. */
  created: { label: string; count: number }[];
  /** Rows that did not import, for the "download errors" CSV. */
  problems: ResolvedRow[];
};

/** Hard caps. The 5 MB ceiling matches serverActions.bodySizeLimit in next.config.ts. */
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Who and what an import is running against. Resolved once per action call. */
export type ImportContext = {
  propertyId: string;
  userId: string;
  hasBlocks: boolean;
  isFlat: boolean;
};
