import "server-only";

// Preview and commit, over one shared planning pass. The preview is a genuine dry run:
// it builds exactly the plan the commit will build, then throws it away instead of
// applying it. The commit re-plans inside the transaction so what it writes is decided
// against the same snapshot it writes into.
import { prisma } from "@/lib/prisma";

import { applyExpenses, planExpenses } from "./plan-expenses";
import { applyPayments, planPayments } from "./plan-payments";
import { applyStructurePlan, planStructure } from "./plan-structure";
import { applyTenants, planTenants } from "./plan-tenants";
import type { ImportDb } from "./structure-map";
import type {
  ColumnMapping,
  ImportContext,
  ImportKind,
  ImportOptions,
  ImportPreview,
  ImportSummary,
  ResolvedRow,
} from "./types";
import { coerceRows } from "./validate";

export type ImportInput = {
  kind: ImportKind;
  mapping: ColumnMapping;
  rows: string[][];
  /** Spreadsheet row number of rows[0], so reported rows point at the user's own file. */
  firstDataRow: number;
  options: ImportOptions;
};

/** A planned import, plus the write that would make it real. */
type Planned = {
  rows: ResolvedRow[];
  blank: number;
  apply: (tx: Parameters<typeof applyTenants>[0]) => Promise<{ label: string; count: number }[]>;
};

/** Build the plan for whichever sheet type this is. Reads only — never writes. */
async function plan(db: ImportDb, ctx: ImportContext, input: ImportInput): Promise<Planned> {
  const coerced = coerceRows(input.kind, input.mapping, input.rows, input.firstDataRow);

  switch (input.kind) {
    case "tenants": {
      const result = await planTenants(db, ctx, coerced, input.options);
      return { rows: result.rows, blank: result.blank, apply: (tx) => applyTenants(tx, ctx, result) };
    }
    case "structure": {
      const result = await planStructure(db, ctx, coerced);
      return { rows: result.rows, blank: result.blank, apply: (tx) => applyStructurePlan(tx, ctx, result) };
    }
    case "payments": {
      const result = await planPayments(db, ctx, coerced);
      return { rows: result.rows, blank: result.blank, apply: (tx) => applyPayments(tx, ctx, result) };
    }
    case "expenses": {
      const result = await planExpenses(db, ctx, coerced, input.options);
      return { rows: result.rows, blank: result.blank, apply: (tx) => applyExpenses(tx, ctx, result) };
    }
  }
}

function tally(rows: ResolvedRow[]) {
  return {
    ready: rows.filter((row) => row.status === "ready").length,
    skipped: rows.filter((row) => row.status === "skip").length,
    errored: rows.filter((row) => row.status === "error").length,
  };
}

/** What would happen, without writing anything. */
export async function previewImport(ctx: ImportContext, input: ImportInput): Promise<ImportPreview> {
  const planned = await plan(prisma, ctx, input);
  return { rows: planned.rows, blank: planned.blank, ...tally(planned.rows) };
}

/**
 * Write the rows that resolved cleanly. Rows with problems are left out and reported,
 * so a sheet with three bad lines still imports the rest instead of failing whole.
 * A single transaction, generously timed: the default 5 s is not enough for a few
 * hundred move-ins, each of which touches a tenant, a tenancy, a bed and the ledger.
 */
export async function commitImport(ctx: ImportContext, input: ImportInput): Promise<ImportSummary> {
  return prisma.$transaction(
    async (tx) => {
      const planned = await plan(tx, ctx, input);
      const created = await planned.apply(tx);
      const counts = tally(planned.rows);
      return {
        imported: counts.ready,
        skipped: counts.skipped,
        failed: counts.errored,
        created,
        problems: planned.rows.filter((row) => row.status !== "ready"),
      };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}
