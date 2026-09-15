// Cell coercion for the bulk importer. Pure functions only (no Node/Prisma imports)
// so the browser wizard and the server resolver read a messy spreadsheet identically
// — same pattern as tenancy.ts, rent.ts and invoice-compute.ts.
//
// Everything arrives as a raw string: the file readers deliberately stringify every
// cell rather than let a parsing library guess whether 03/04/2024 is March or April.
// That call is made here, once, and is day-first (Indian convention).
import type { PaymentMethod } from "@/generated/prisma/client";

import { rupeesToPaise } from "@/lib/money";

export type Coerced<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Coerced<T> => ({ ok: true, value });
const fail = (error: string): Coerced<never> => ({ ok: false, error });

/**
 * Trim a raw cell and strip the invisible characters spreadsheets love to smuggle in
 * (BOM, zero-width spaces, non-breaking spaces), collapsing inner runs of whitespace.
 */
export function cleanCell(raw: string): string {
  return raw
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a cell holds nothing meaningful — blank, or a placeholder dash / "n/a". */
export function isBlank(raw: string): boolean {
  const value = cleanCell(raw).toLowerCase();
  return value === "" || value === "-" || value === "--" || value === "n/a" || value === "na" || value === "nil";
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Parse a rupee cell into integer paise. Tolerates the ways money is actually typed
 * into a PG register: "₹8,500", "Rs. 8500/-", "INR 8,500.00", "8500".
 */
export function parseRupees(raw: string): Coerced<number> {
  const cleaned = cleanCell(raw)
    .replace(/[₹]/g, "")
    .replace(/\b(?:rs|inr)\b\.?/gi, "")
    .replace(/\/-\s*$/, "")
    .replace(/,/g, "")
    .replace(/\s/g, "");
  if (!cleaned) return fail("is empty");
  if (cleaned.startsWith("-")) return fail(`"${cleanCell(raw)}" is negative`);
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return fail(`"${cleanCell(raw)}" is not an amount`);
  const rupees = Number(cleaned);
  if (!Number.isFinite(rupees)) return fail(`"${cleanCell(raw)}" is not an amount`);
  if (rupees > 100_000_000) return fail(`"${cleanCell(raw)}" is unrealistically large`);
  return ok(rupeesToPaise(rupees));
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Month index (0-11) for a name or three-letter abbreviation, or -1. */
function monthFromName(name: string): number {
  const value = name.toLowerCase();
  return MONTH_NAMES.findIndex((month) => month === value || month.slice(0, 3) === value.slice(0, 3));
}

/** Expand a two-digit year the way spreadsheets do: 70-99 => 19xx, 00-69 => 20xx. */
function expandYear(year: number, digits: number): number {
  if (digits > 2) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

/** Build a local-midnight date, rejecting impossible days like 31 February. */
function makeDate(year: number, monthIndex: number, day: number): Coerced<Date> {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return fail("is not a real date");
  const date = new Date(year, monthIndex, day);
  if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day) {
    return fail("is not a real date");
  }
  if (year < 1950 || year > 2100) return fail("has an out-of-range year");
  return ok(date);
}

// Excel stores dates as days since 1899-12-30. Only treat a bare number as a serial
// inside a plausible window (1941-2064) so a stray "2024" is not read as a date.
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MIN_EXCEL_SERIAL = 15000;
const MAX_EXCEL_SERIAL = 60000;

function fromExcelSerial(serial: number): Coerced<Date> {
  const utc = new Date(EXCEL_EPOCH_UTC + Math.floor(serial) * 86_400_000);
  return makeDate(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/**
 * Parse a date cell. Accepts ISO (2024-06-01), day-first numeric (01/06/2024,
 * 1-6-24, 1.6.2024), named months (1 Jun 2024, Jun 1 2024) and Excel serial numbers.
 *
 * An ambiguous numeric date is read DAY-FIRST, except where the numbers settle it —
 * 06/13/2024 can only be month-first, so it is read that way rather than rejected.
 */
export function parseFlexibleDate(raw: string): Coerced<Date> {
  const value = cleanCell(raw);
  if (!value) return fail("is empty");

  // ISO, optionally with a time component we discard.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(value);
  if (iso) return makeDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  // Numeric, separated by / - or . — day-first unless that is impossible.
  const numeric = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(value);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = expandYear(Number(numeric[3]), numeric[3].length);
    const monthFirst = first <= 12 && second > 12;
    return monthFirst
      ? makeDate(year, first - 1, second)
      : makeDate(year, second - 1, first);
  }

  // 1 Jun 2024 / 1-June-24
  const dayMonth = /^(\d{1,2})[\s\-.]+([A-Za-z]{3,9})[\s\-.,]+(\d{2,4})$/.exec(value);
  if (dayMonth) {
    const monthIndex = monthFromName(dayMonth[2]);
    if (monthIndex < 0) return fail(`"${value}" has an unrecognised month`);
    return makeDate(expandYear(Number(dayMonth[3]), dayMonth[3].length), monthIndex, Number(dayMonth[1]));
  }

  // Jun 1, 2024 / June 1 2024
  const monthDay = /^([A-Za-z]{3,9})[\s\-.]+(\d{1,2})[\s\-.,]+(\d{2,4})$/.exec(value);
  if (monthDay) {
    const monthIndex = monthFromName(monthDay[1]);
    if (monthIndex < 0) return fail(`"${value}" has an unrecognised month`);
    return makeDate(expandYear(Number(monthDay[3]), monthDay[3].length), monthIndex, Number(monthDay[2]));
  }

  // Excel serial number.
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const serial = Number(value);
    if (serial >= MIN_EXCEL_SERIAL && serial <= MAX_EXCEL_SERIAL) return fromExcelSerial(serial);
    return fail(`"${value}" is not a date`);
  }

  return fail(`"${value}" is not a date we recognise`);
}

/**
 * Parse a billing-month cell into the first day of that month. Accepts anything
 * parseFlexibleDate handles plus month-only forms: 2024-06, 06/2024, Jun 2024.
 */
export function parseMonthStart(raw: string): Coerced<Date> {
  const value = cleanCell(raw);
  if (!value) return fail("is empty");

  const isoMonth = /^(\d{4})[-/](\d{1,2})$/.exec(value);
  if (isoMonth) return makeDate(Number(isoMonth[1]), Number(isoMonth[2]) - 1, 1);

  const monthYear = /^(\d{1,2})[-/](\d{4})$/.exec(value);
  if (monthYear) return makeDate(Number(monthYear[2]), Number(monthYear[1]) - 1, 1);

  const namedMonth = /^([A-Za-z]{3,9})[\s\-.,]*(\d{2,4})$/.exec(value);
  if (namedMonth) {
    const monthIndex = monthFromName(namedMonth[1]);
    if (monthIndex >= 0) {
      return makeDate(expandYear(Number(namedMonth[2]), namedMonth[2].length), monthIndex, 1);
    }
  }

  const full = parseFlexibleDate(value);
  if (!full.ok) return fail(`"${value}" is not a month`);
  return ok(new Date(full.value.getFullYear(), full.value.getMonth(), 1));
}

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------

/** Same rule as saveBedSchema in src/lib/validations/tenant.ts. */
const INDIAN_PHONE = /^(?:\+91|91|0)?[6-9]\d{9}$/;

/**
 * Normalise a phone cell. `stored` is what goes on the Tenant row (matching what the
 * bed form stores); `key` is the last ten digits, used to recognise the same person
 * whether the sheet wrote +91 98…, 098… or 98…
 */
export function normalizePhone(raw: string): Coerced<{ stored: string; key: string }> {
  const stripped = cleanCell(raw).replace(/[\s\-().]/g, "");
  if (!stripped) return fail("is empty");
  if (!INDIAN_PHONE.test(stripped)) return fail(`"${cleanCell(raw)}" is not a valid 10-digit phone number`);
  return ok({ stored: stripped, key: stripped.slice(-10) });
}

/** The dedupe key for an already-stored phone number. */
export function phoneKey(stored: string): string {
  return stored.replace(/[\s\-().]/g, "").slice(-10);
}

// ---------------------------------------------------------------------------
// Small scalars
// ---------------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseEmail(raw: string): Coerced<string> {
  const value = cleanCell(raw).toLowerCase();
  if (!value) return fail("is empty");
  if (!EMAIL.test(value)) return fail(`"${value}" is not a valid email address`);
  return ok(value);
}

export function parseInteger(raw: string, min: number, max: number): Coerced<number> {
  const value = cleanCell(raw).replace(/,/g, "");
  const digits = /^-?\d+/.exec(value);
  if (!digits) return fail(`"${cleanCell(raw)}" is not a number`);
  const parsed = Number(digits[0]);
  if (!Number.isInteger(parsed)) return fail(`"${cleanCell(raw)}" is not a whole number`);
  if (parsed < min || parsed > max) return fail(`"${cleanCell(raw)}" must be between ${min} and ${max}`);
  return ok(parsed);
}

const TRUTHY = new Set(["paid", "yes", "y", "1", "true", "done", "received", "collected", "cleared", "settled"]);
const FALSY = new Set(["pending", "no", "n", "0", "false", "unpaid", "due", "not paid", "notpaid", "outstanding", "balance"]);

/** Read a yes/no-ish cell. Returns null when the value means neither. */
export function parseBoolish(raw: string): boolean | null {
  const value = cleanCell(raw).toLowerCase();
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  return null;
}

export function parsePaymentStatus(raw: string): Coerced<"PAID" | "PENDING"> {
  const flag = parseBoolish(raw);
  if (flag === null) return fail(`"${cleanCell(raw)}" is not a payment status — use Paid or Pending`);
  return ok(flag ? "PAID" : "PENDING");
}

export function parsePaymentMethod(raw: string): Coerced<PaymentMethod> {
  const value = cleanCell(raw).toLowerCase().replace(/[\s\-_+/]/g, "");
  if (["cash", "byhand", "currency"].includes(value)) return ok("CASH");
  if (["online", "upi", "bank", "banktransfer", "neft", "imps", "rtgs", "gpay", "phonepe", "paytm", "transfer", "card"].includes(value)) {
    return ok("ONLINE");
  }
  if (["split", "cashonline", "onlinecash", "both", "mixed", "partial"].includes(value)) return ok("SPLIT");
  return fail(`"${cleanCell(raw)}" is not a payment method — use Cash, Online or Split`);
}

const SHARING_WORDS: Record<string, number> = {
  single: 1, one: 1, private: 1, studio: 1, flat: 1,
  double: 2, twin: 2, two: 2, sharing2: 2,
  triple: 3, three: 3, treble: 3,
  quad: 4, four: 4, quadruple: 4,
  five: 5, six: 6,
};

/** Read a sharing/capacity cell: "3", "3 sharing", "triple", "3-sharing". */
export function parseSharingType(raw: string): Coerced<number> {
  const value = cleanCell(raw).toLowerCase();
  if (!value) return fail("is empty");
  const digits = /(\d+)/.exec(value);
  if (digits) {
    const parsed = Number(digits[1]);
    if (parsed >= 1 && parsed <= 12) return ok(parsed);
    return fail(`"${cleanCell(raw)}" must be between 1 and 12 beds`);
  }
  for (const [word, count] of Object.entries(SHARING_WORDS)) {
    if (value.includes(word)) return ok(count);
  }
  return fail(`"${cleanCell(raw)}" is not a sharing type`);
}

/** Bed labels are single letters here, matching nextBedLabels in actions/admin.ts. */
export function bedLabelAt(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * Normalise a bed label so "a", "A", "Bed B" and "2" all resolve. Numeric labels are
 * mapped onto letters (1 -> A) because that is how the app creates beds.
 */
export function normalizeBedLabel(raw: string): string {
  const value = cleanCell(raw).toUpperCase().replace(/^(?:BED|COT)\s*/, "").replace(/[^A-Z0-9]/g, "");
  if (/^\d+$/.test(value)) {
    const index = Number(value) - 1;
    return index >= 0 && index < 26 ? bedLabelAt(index) : value;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Room addressing
// ---------------------------------------------------------------------------

/**
 * Match key for a room number, so "Room 301", "301" and "301 " are one room. Block
 * letters are kept, leaving "A301" distinct from "B301".
 */
export function normalizeRoomNumber(raw: string): string {
  return cleanCell(raw)
    .toUpperCase()
    .replace(/^(?:ROOM|FLAT|UNIT)\s*(?:NO\.?)?\s*/, "")
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Which floor a room number implies when the sheet has no floor column: the digits
 * before the last two. 301 -> 3, 1204 -> 12, and a one- or two-digit number is taken
 * to be on the ground floor.
 */
export function inferFloorNumber(roomKey: string): number {
  const digits = roomKey.replace(/^[A-Z]+/, "").replace(/\D/g, "");
  if (digits.length <= 2) return 0;
  return Number(digits.slice(0, digits.length - 2)) || 0;
}

/** The block a room number implies when the sheet has no block column: its leading letters. */
export function inferBlockName(roomKey: string): string | null {
  const letters = /^[A-Z]+/.exec(roomKey);
  return letters ? letters[0] : null;
}
