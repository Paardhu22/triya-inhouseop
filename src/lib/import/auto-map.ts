// Guessing which spreadsheet column feeds which of our fields, and which sheet type
// the user has handed us. Pure — the wizard pre-fills the mapping step with this and
// the user corrects anything it got wrong, so a wrong guess is cheap and a right one
// saves twenty dropdowns.
import { fieldDef, IMPORT_KIND_DEFS, kindDef } from "./fields";
import { IMPORT_KINDS, type ColumnMapping, type FieldDef, type ImportKind } from "./types";

/** Lowercase, punctuation to spaces, runs collapsed: "Mobile No." -> "mobile no". */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The same thing with spaces removed, for spelling-insensitive equality. */
function squash(header: string): string {
  return normalizeHeader(header).replace(/ /g, "");
}

function tokens(header: string): string[] {
  return normalizeHeader(header).split(" ").filter(Boolean);
}

/** Every spelling that should map onto a field, most authoritative first. */
function candidates(field: FieldDef): string[] {
  return [field.key, field.label, ...field.aliases];
}

const MIN_SCORE = 45;

/**
 * How strongly a header suggests a field. 0 means no relationship worth acting on.
 * Exact matches dominate; substring and shared-word matches only break ties.
 */
function score(header: string, field: FieldDef): number {
  const squashedHeader = squash(header);
  if (!squashedHeader) return 0;
  const headerTokens = tokens(header);

  let best = 0;
  candidates(field).forEach((candidate, index) => {
    const squashedCandidate = squash(candidate);
    if (!squashedCandidate) return;

    // Exact, with a small preference for the key and label over the alias list.
    if (squashedHeader === squashedCandidate) {
      best = Math.max(best, index === 0 ? 100 : index === 1 ? 95 : 90);
      return;
    }
    // One is a prefix of the other — "rentamount" vs "rent".
    if (
      squashedCandidate.length >= 4 &&
      (squashedHeader.startsWith(squashedCandidate) || squashedCandidate.startsWith(squashedHeader))
    ) {
      best = Math.max(best, 70);
      return;
    }
    // Contained anywhere — "tenant mobile number" vs "mobile number".
    if (squashedCandidate.length >= 5 && squashedHeader.includes(squashedCandidate)) {
      best = Math.max(best, 60);
      return;
    }
    // Shared words, scaled by how much of the candidate is covered.
    const candidateTokens = tokens(candidate);
    const shared = candidateTokens.filter((token) => token.length > 2 && headerTokens.includes(token));
    if (shared.length) {
      best = Math.max(best, 30 + Math.round((shared.length / candidateTokens.length) * 20));
    }
  });
  return best;
}

/**
 * Pair headers to fields greedily, best score first, so each column feeds at most one
 * field and each field is fed by at most one column. Ambiguous headers ("rent" when
 * both Monthly rent and Default rent exist) settle on whichever scores higher.
 */
export function suggestMapping(kind: ImportKind, headers: string[]): ColumnMapping {
  const fields = kindDef(kind).fields;
  const pairs: { fieldKey: string; column: number; value: number }[] = [];

  fields.forEach((field) => {
    headers.forEach((header, column) => {
      const value = score(header, field);
      if (value >= MIN_SCORE) pairs.push({ fieldKey: field.key, column, value });
    });
  });

  // Highest score first; required fields win ties so a sheet with one "name" column
  // spends it on the required Full name rather than an optional Tenant name.
  pairs.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    const aRequired = fieldDef(kind, a.fieldKey)?.required ? 1 : 0;
    const bRequired = fieldDef(kind, b.fieldKey)?.required ? 1 : 0;
    if (bRequired !== aRequired) return bRequired - aRequired;
    return a.column - b.column;
  });

  const mapping: ColumnMapping = {};
  const usedColumns = new Set<number>();
  for (const pair of pairs) {
    if (mapping[pair.fieldKey] !== undefined || usedColumns.has(pair.column)) continue;
    mapping[pair.fieldKey] = pair.column;
    usedColumns.add(pair.column);
  }
  return mapping;
}

/**
 * Which sheet type these headers look like. Weighted towards covering the REQUIRED
 * fields — a sheet with a billing month and an amount is a payments sheet even though
 * "room number" would also fit the tenants shape.
 */
export function detectKind(headers: string[]): ImportKind {
  let bestKind: ImportKind = "tenants";
  let bestScore = -1;

  for (const kind of IMPORT_KINDS) {
    const def = IMPORT_KIND_DEFS[kind];
    const mapping = suggestMapping(kind, headers);
    const required = def.fields.filter((field) => field.required);
    const requiredHit = required.length
      ? required.filter((field) => mapping[field.key] !== undefined).length / required.length
      : 0;
    const coverage = headers.length ? Object.keys(mapping).length / headers.length : 0;
    const total = requiredHit * 3 + coverage;
    if (total > bestScore) {
      bestScore = total;
      bestKind = kind;
    }
  }
  return bestKind;
}

/** Required fields (and require-one-of groups) the mapping does not yet satisfy. */
export function missingRequirements(kind: ImportKind, mapping: ColumnMapping): string[] {
  const def = kindDef(kind);
  const missing = def.fields
    .filter((field) => field.required && mapping[field.key] === undefined)
    .map((field) => field.label);

  for (const group of def.requireOneOf ?? []) {
    if (!group.keys.some((key) => mapping[key] !== undefined)) missing.push(group.label);
  }
  return missing;
}
