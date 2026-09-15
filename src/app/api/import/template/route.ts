import { auth } from "@/auth";
import { templateCsv, templateFilename } from "@/lib/import/template";
import { IMPORT_KINDS, type ImportKind } from "@/lib/import/types";

// GET /api/import/template?kind=tenants — a starter CSV for one import type, built
// from the field catalogue so it can never list a column the importer does not accept.
// /api is excluded from the proxy matcher (src/proxy.ts), so this handler authenticates
// itself, exactly like src/app/api/expenses/export/route.ts.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const kind = new URL(req.url).searchParams.get("kind") ?? "";
  if (!IMPORT_KINDS.includes(kind as ImportKind)) {
    return new Response("Unknown import type", { status: 400 });
  }

  // A BOM so Excel opens the file as UTF-8 and renders the ₹ sign correctly.
  const body = `﻿${templateCsv(kind as ImportKind)}`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${templateFilename(kind as ImportKind)}"`,
      "Cache-Control": "no-store",
    },
  });
}
