import "server-only";

// The building importer: one row per room, creating the block / floor / room / bed
// chain a brand-new property needs before any resident can be moved in.
import type { Prisma } from "@/generated/prisma/client";

import { normalizeRoomNumber } from "./coerce";
import {
  applyStructure,
  loadStructureMap,
  planRoom,
  type ImportDb,
  type StructureMap,
} from "./structure-map";
import type { ImportContext, ResolvedRow } from "./types";
import { readNumber, readText, type CoercedRow } from "./validate";

export type StructurePlan = {
  rows: ResolvedRow[];
  blank: number;
  map: StructureMap;
};

export async function planStructure(
  db: ImportDb,
  ctx: ImportContext,
  coerced: CoercedRow[],
): Promise<StructurePlan> {
  const map = await loadStructureMap(db, ctx.propertyId);
  const rows: ResolvedRow[] = [];
  const plannedThisSheet = new Set<string>();
  let blank = 0;

  for (const row of coerced) {
    if (row.blank) {
      blank += 1;
      continue;
    }

    const roomNumber = readText(row, "roomNumber") ?? "";
    const label = roomNumber ? `${ctx.isFlat ? "Flat" : "Room"} ${roomNumber}` : "(no room number)";
    const push = (status: ResolvedRow["status"], message: string) =>
      rows.push({ rowNumber: row.rowNumber, status, message, label });

    if (row.errors.length) {
      push("error", row.errors.join("; "));
      continue;
    }
    if (!roomNumber) {
      push("error", "Room / flat number is required");
      continue;
    }

    const floorNumber = readNumber(row, "floorNumber");
    const sharingType = readNumber(row, "sharingType");
    if (floorNumber === null || sharingType === null) {
      push("error", "Floor and the number of beds are both needed");
      continue;
    }
    if (ctx.hasBlocks && !readText(row, "blockName")) {
      push("error", "This property is organised into blocks, so each room needs a block");
      continue;
    }

    const key = normalizeRoomNumber(roomNumber);
    if (plannedThisSheet.has(key)) {
      push("skip", "This room appears more than once in the sheet");
      continue;
    }
    if (map.has(key)) {
      push("skip", "Already exists in this property");
      continue;
    }

    const beds = ctx.isFlat ? 1 : sharingType;
    planRoom(
      map,
      {
        number: roomNumber,
        floorNumber,
        blockName: readText(row, "blockName"),
        label: readText(row, "roomLabel"),
        defaultRent: readNumber(row, "defaultRent"),
        defaultMaintenance: readNumber(row, "defaultMaintenance"),
        bedCount: beds,
      },
      ctx.hasBlocks,
    );
    plannedThisSheet.add(key);

    push(
      "ready",
      ctx.isFlat
        ? `Create flat on floor ${floorNumber}`
        : `Create with ${beds} bed${beds === 1 ? "" : "s"} on floor ${floorNumber}`,
    );
  }

  return { rows, blank, map };
}

export async function applyStructurePlan(
  tx: Prisma.TransactionClient,
  ctx: ImportContext,
  plan: StructurePlan,
): Promise<{ label: string; count: number }[]> {
  const result = await applyStructure(tx, ctx.propertyId, plan.map, ctx.hasBlocks);
  return [
    { label: "Blocks created", count: result.blocks },
    { label: "Floors created", count: result.floors },
    { label: ctx.isFlat ? "Flats created" : "Rooms created", count: result.rooms },
    { label: "Beds created", count: result.beds },
  ].filter((entry) => entry.count > 0);
}
