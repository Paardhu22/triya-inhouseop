"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { detectKind } from "@/lib/import/auto-map";
import { ImportParseError, parseImportFile, parseImportText } from "@/lib/import/parse-file";
import { commitImport, previewImport } from "@/lib/import/run";
import {
  MAX_IMPORT_BYTES,
  type ImportContext,
  type ImportPreview,
  type ImportSummary,
  type ParsedUpload,
} from "@/lib/import/types";
import { prisma } from "@/lib/prisma";
import { getActiveProperty } from "@/lib/property";
import { importRunSchema } from "@/lib/validations/import";

type CtxResult = { ok: true; ctx: ImportContext } | { ok: false; error: string };

/**
 * Importing can create structure and writes in bulk, so it is ADMIN-only, matching
 * /admin. The acting user is looked up for real rather than trusted from the JWT: the
 * app's sessions outlive a db reset, and a stale id would break the createdBy foreign
 * keys on the payments and expenses this import writes (same guard as actions/expenses.ts).
 */
async function requireContext(): Promise<CtxResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const { id, email } = session.user;
  let user = id
    ? await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } })
    : null;
  if (!user && email) {
    user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  }
  if (!user) {
    return { ok: false, error: "Your session is out of date. Please sign out and sign in again." };
  }
  if (user.role !== "ADMIN") return { ok: false, error: "Administrator access required" };

  const property = await getActiveProperty();
  if (!property) return { ok: false, error: "No active property selected" };

  return {
    ok: true,
    ctx: {
      propertyId: property.id,
      userId: user.id,
      hasBlocks: property.hasBlocks,
      isFlat: property.isFlat,
    },
  };
}

/**
 * Read an uploaded file, or a block of cells pasted out of Excel, into a grid of raw
 * strings plus a first guess at what kind of sheet it is and which column feeds which
 * field. Nothing is written and nothing is remembered — the grid goes back to the
 * browser, which sends it on to preview and commit.
 */
export async function parseImportUpload(formData: FormData): Promise<ActionResult<ParsedUpload>> {
  const context = await requireContext();
  if (!context.ok) return actionError(context.error);

  const file = formData.get("file");
  const pasted = formData.get("text");

  try {
    let sheets;
    let sourceName: string;

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_IMPORT_BYTES) {
        return actionError("That file is larger than 5 MB. Split it, or save just the data sheet as CSV.");
      }
      sheets = await parseImportFile(file);
      sourceName = file.name;
    } else if (typeof pasted === "string" && pasted.trim()) {
      if (pasted.length > MAX_IMPORT_BYTES) {
        return actionError("That is more data than can be pasted at once. Upload it as a file instead.");
      }
      sheets = parseImportText(pasted);
      sourceName = "Pasted data";
    } else {
      return actionError("Choose a file or paste some data first");
    }

    const first = sheets.find((sheet) => sheet.rows.length > 0) ?? sheets[0];
    if (!first || first.headers.length === 0) {
      return actionError("No column headings were found. Make sure the first row names the columns.");
    }

    return actionOk({ sourceName, sheets, suggestedKind: detectKind(first.headers) });
  } catch (error) {
    if (error instanceof ImportParseError) return actionError(error.message);
    console.error("Import parse failed:", error);
    return actionError("That file could not be read. Try saving it as a CSV and uploading again.");
  }
}

/** Resolve every row against the live property and report what would happen. No writes. */
export async function previewImportRows(input: unknown): Promise<ActionResult<ImportPreview>> {
  const context = await requireContext();
  if (!context.ok) return actionError(context.error);

  const parsed = importRunSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid import request");

  try {
    return actionOk(await previewImport(context.ctx, parsed.data));
  } catch (error) {
    console.error("Import preview failed:", error);
    return actionError("Could not check that sheet. Please try again.");
  }
}

function revalidateImportedViews() {
  revalidatePath("/dashboard");
  revalidatePath("/floor-manager");
  revalidatePath("/tenants");
  revalidatePath("/collections");
  revalidatePath("/expenses");
  revalidatePath("/reports");
  revalidatePath("/admin");
}

/** Write the rows that resolved cleanly, and report exactly what landed. */
export async function commitImportRows(input: unknown): Promise<ActionResult<ImportSummary>> {
  const context = await requireContext();
  if (!context.ok) return actionError(context.error);

  const parsed = importRunSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid import request");

  let summary: ImportSummary;
  try {
    summary = await commitImport(context.ctx, parsed.data);
  } catch (error) {
    console.error("Import commit failed:", error);
    return actionError("The import could not be completed, so nothing was saved. Please try again.");
  }

  revalidateImportedViews();
  return actionOk(summary);
}
