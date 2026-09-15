import { z } from "zod";

import { MAX_IMPORT_ROWS } from "@/lib/import/types";

export const importKindSchema = z.enum(["tenants", "structure", "payments", "expenses"]);

export const importOptionsSchema = z.object({
  createMissingStructure: z.boolean(),
  depositIsGross: z.boolean(),
  createMissingCategories: z.boolean(),
});

/**
 * The grid and mapping the wizard sends back for a preview or a commit. The rows are
 * re-validated and re-resolved server-side from these raw strings — the browser's own
 * verdict on a row is never trusted, only its column choices.
 */
export const importRunSchema = z.object({
  kind: importKindSchema,
  mapping: z.record(z.string().max(60), z.number().int().min(0).max(1000)),
  rows: z.array(z.array(z.string().max(2000)).max(200)).max(MAX_IMPORT_ROWS),
  firstDataRow: z.number().int().min(1).max(MAX_IMPORT_ROWS + 100),
  options: importOptionsSchema,
});

export type ImportRunInput = z.infer<typeof importRunSchema>;
