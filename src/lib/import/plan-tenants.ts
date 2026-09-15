import "server-only";

// The residents importer. Per row it does what saveBed in src/lib/actions/floor.ts
// does on a move-in — create the tenant, create the tenancy, occupy the bed, hold back
// the maintenance reserve, seed the ledger — so the two paths cannot drift apart.
import { startOfMonth } from "date-fns";

import type { PaymentMethod, Prisma } from "@/generated/prisma/client";
import { refreshPaymentStatus, settleMonth } from "@/lib/ledger";
import { MAINTENANCE_RESERVE_PAISE } from "@/lib/tenancy";

import { normalizeBedLabel, normalizeRoomNumber, phoneKey } from "./coerce";
import {
  addBed,
  applyStructure,
  bedKey,
  loadStructureMap,
  planRoom,
  type ImportDb,
  type StructureMap,
} from "./structure-map";
import type { ImportContext, ImportOptions, ResolvedRow } from "./types";
import {
  readDate,
  readNumber,
  readPaymentMethod,
  readPaymentStatus,
  readPhone,
  readText,
  type CoercedRow,
} from "./validate";

type TenantDetails = {
  fullName: string;
  phone: string;
  email: string | null;
  emergencyContact: string | null;
  fatherName: string | null;
  motherName: string | null;
  address: string | null;
  aadhaarNumber: string | null;
  panNumber: string | null;
  college: string | null;
  company: string | null;
  occupation: string | null;
  notes: string | null;
};

type PlannedMoveIn = {
  rowNumber: number;
  /** Set when the person is already on file (a returning resident) and is reused. */
  tenantId: string | null;
  tenant: TenantDetails;
  /** Address of the bed within the structure map. */
  bed: string;
  monthlyRent: number;
  maintenanceCharge: number;
  /** Already net of the maintenance reserve, exactly as the tenancy stores it. */
  securityDeposit: number | null;
  checkInDate: Date;
  paymentDueDay: number | null;
  paymentStatus: "PAID" | "PENDING";
  paymentMethod: PaymentMethod;
};

export type TenantsPlan = {
  rows: ResolvedRow[];
  blank: number;
  map: StructureMap;
  moveIns: PlannedMoveIn[];
};

function details(row: CoercedRow): TenantDetails {
  return {
    fullName: readText(row, "fullName") ?? "",
    phone: readPhone(row, "phone")?.stored ?? "",
    email: readText(row, "email"),
    emergencyContact: readText(row, "emergencyContact"),
    fatherName: readText(row, "fatherName"),
    motherName: readText(row, "motherName"),
    address: readText(row, "address"),
    aadhaarNumber: readText(row, "aadhaarNumber"),
    panNumber: readText(row, "panNumber"),
    college: readText(row, "college"),
    company: readText(row, "company"),
    occupation: readText(row, "occupation"),
    notes: readText(row, "notes"),
  };
}

/** Only the fields the sheet actually filled in, so an import never blanks existing data. */
function providedDetails(tenant: TenantDetails): Prisma.TenantUpdateInput {
  const update: Prisma.TenantUpdateInput = { fullName: tenant.fullName, phone: tenant.phone };
  for (const [key, value] of Object.entries(tenant)) {
    if (key === "fullName" || key === "phone") continue;
    if (value !== null) Object.assign(update, { [key]: value });
  }
  return update;
}

export async function planTenants(
  db: ImportDb,
  ctx: ImportContext,
  coerced: CoercedRow[],
  options: ImportOptions,
): Promise<TenantsPlan> {
  const map = await loadStructureMap(db, ctx.propertyId);

  const existingTenants = await db.tenant.findMany({
    where: { propertyId: ctx.propertyId },
    select: {
      id: true,
      fullName: true,
      phone: true,
      tenancies: { where: { status: "ACTIVE" }, take: 1, select: { id: true } },
    },
  });
  const onFile = new Map<string, { id: string; fullName: string; active: boolean }>();
  for (const tenant of existingTenants) {
    onFile.set(phoneKey(tenant.phone), {
      id: tenant.id,
      fullName: tenant.fullName,
      active: tenant.tenancies.length > 0,
    });
  }

  const rows: ResolvedRow[] = [];
  const moveIns: PlannedMoveIn[] = [];
  const seenInSheet = new Map<string, number>();
  let blank = 0;

  // Self-contained flats have no per-bed sharing, so every message names the unit the
  // way the rest of the app does (see Property.isFlat).
  const Unit = ctx.isFlat ? "Flat" : "Room";
  const unit = ctx.isFlat ? "flat" : "room";

  for (const row of coerced) {
    if (row.blank) {
      blank += 1;
      continue;
    }

    const name = readText(row, "fullName") ?? "";
    const roomNumber = readText(row, "roomNumber") ?? "";
    const label = [name || "(no name)", roomNumber ? `${Unit} ${roomNumber}` : null]
      .filter(Boolean)
      .join(" · ");
    const fail = (message: string) => rows.push({ rowNumber: row.rowNumber, status: "error", message, label });
    const skip = (message: string) => rows.push({ rowNumber: row.rowNumber, status: "skip", message, label });

    if (row.errors.length) {
      fail(row.errors.join("; "));
      continue;
    }
    if (name.trim().length < 2) {
      fail("Full name is too short");
      continue;
    }

    const phone = readPhone(row, "phone");
    const checkInDate = readDate(row, "checkInDate");
    const monthlyRent = readNumber(row, "monthlyRent");
    if (!phone || !checkInDate || monthlyRent === null) {
      fail("Name, phone, rent and check-in date are all needed");
      continue;
    }

    // --- Is this person already accounted for? Decided before a bed is claimed, so a
    // --- skipped row never consumes occupancy that a later row could have used.
    const duplicateAt = seenInSheet.get(phone.key);
    if (duplicateAt !== undefined) {
      skip(`Same phone number as row ${duplicateAt} of this sheet`);
      continue;
    }
    const existing = onFile.get(phone.key) ?? null;
    if (existing?.active) {
      skip(`${existing.fullName} is already living here with this number`);
      continue;
    }
    seenInSheet.set(phone.key, row.rowNumber);

    // --- Room ---
    if (!roomNumber) {
      fail(`${Unit} number is required`);
      continue;
    }
    const roomKey = normalizeRoomNumber(roomNumber);
    let room = map.get(roomKey);
    let createdRoom = false;
    if (!room) {
      if (!options.createMissingStructure) {
        fail(`${Unit} ${roomNumber} does not exist — tick "Create missing rooms and beds" to add it`);
        continue;
      }
      room = planRoom(
        map,
        {
          number: roomNumber,
          floorNumber: readNumber(row, "floorNumber"),
          blockName: readText(row, "blockName"),
        },
        ctx.hasBlocks,
      );
      createdRoom = true;
    }

    // --- Bed ---
    const wantedLabel = readText(row, "bedLabel");
    const wantedBed = wantedLabel ? normalizeBedLabel(wantedLabel) : null;
    let bed = wantedBed
      ? (room.beds.find((item) => item.label === wantedBed) ?? null)
      : (room.beds.find((item) => !item.taken) ?? null);

    if (bed?.taken) {
      fail(
        ctx.isFlat
          ? `Flat ${room.number} is already occupied`
          : `Bed ${bed.label} in room ${room.number} is already occupied`,
      );
      continue;
    }
    if (!bed) {
      // A flat is a single unit, so its one bed is either free or it is not.
      const canGrow = options.createMissingStructure && !(ctx.isFlat && room.beds.length >= 1);
      if (!canGrow) {
        fail(
          ctx.isFlat
            ? `Flat ${room.number} is already occupied`
            : wantedLabel
              ? `Room ${room.number} has no bed ${wantedLabel}`
              : `Room ${room.number} has no free bed`,
        );
        continue;
      }
      bed = addBed(room, wantedLabel);
      if (!bed) {
        fail(`Could not add another bed to ${unit} ${room.number}`);
        continue;
      }
    }
    bed.taken = true;

    // --- Money ---
    const grossDeposit = readNumber(row, "securityDeposit");
    const securityDeposit =
      grossDeposit === null
        ? null
        : options.depositIsGross
          ? Math.max(0, grossDeposit - MAINTENANCE_RESERVE_PAISE)
          : grossDeposit;

    moveIns.push({
      rowNumber: row.rowNumber,
      tenantId: existing?.id ?? null,
      tenant: details(row),
      bed: bedKey(room.key, bed.label),
      monthlyRent,
      maintenanceCharge: readNumber(row, "maintenanceCharge") ?? room.defaultMaintenance ?? 0,
      securityDeposit,
      checkInDate,
      paymentDueDay: readNumber(row, "paymentDueDay"),
      paymentStatus: readPaymentStatus(row, "paymentStatus") ?? "PENDING",
      paymentMethod: readPaymentMethod(row, "paymentMethod") ?? "CASH",
    });

    const where = ctx.isFlat ? `flat ${room.number}` : `room ${room.number}, bed ${bed.label}`;
    const extra = createdRoom ? ` (${unit} will be created)` : "";
    rows.push({
      rowNumber: row.rowNumber,
      status: "ready",
      message: existing
        ? `Returning resident — new tenancy in ${where}${extra}`
        : `Move in to ${where}${extra}`,
      label,
    });
  }

  return { rows, blank, map, moveIns };
}

export async function applyTenants(
  tx: Prisma.TransactionClient,
  ctx: ImportContext,
  plan: TenantsPlan,
): Promise<{ label: string; count: number }[]> {
  const structure = await applyStructure(tx, ctx.propertyId, plan.map, ctx.hasBlocks);

  const now = new Date();
  const currentMonth = startOfMonth(now);
  let newTenants = 0;
  let returning = 0;

  for (const moveIn of plan.moveIns) {
    const bedId = structure.bedIds.get(moveIn.bed);
    if (!bedId) continue;

    let tenantId = moveIn.tenantId;
    if (tenantId) {
      await tx.tenant.update({ where: { id: tenantId }, data: providedDetails(moveIn.tenant) });
      returning += 1;
    } else {
      const tenant = await tx.tenant.create({
        data: { propertyId: ctx.propertyId, ...moveIn.tenant },
        select: { id: true },
      });
      tenantId = tenant.id;
      newTenants += 1;
    }

    const bed = await tx.bed.update({
      where: { id: bedId },
      data: { status: "OCCUPIED" },
      select: { id: true, roomId: true },
    });

    const tenancy = await tx.tenancy.create({
      data: {
        propertyId: ctx.propertyId,
        tenantId,
        bedId: bed.id,
        roomId: bed.roomId,
        status: "ACTIVE",
        monthlyRent: moveIn.monthlyRent,
        maintenanceCharge: moveIn.maintenanceCharge,
        securityDeposit: moveIn.securityDeposit,
        paymentStatus: moveIn.paymentStatus,
        paymentDueDay: moveIn.paymentDueDay,
        checkInDate: moveIn.checkInDate,
      },
      select: { id: true },
    });

    // The ledger is the source of truth for paymentStatus, exactly as in saveBed:
    // record the collection when the sheet says Paid, then derive the snapshot.
    const ledgerTenancy = {
      id: tenancy.id,
      tenantId,
      monthlyRent: moveIn.monthlyRent,
      maintenanceCharge: moveIn.maintenanceCharge,
      paymentDueDay: moveIn.paymentDueDay,
    };
    if (moveIn.paymentStatus === "PAID") {
      await settleMonth(tx, {
        propertyId: ctx.propertyId,
        tenancy: ledgerTenancy,
        forMonth: currentMonth,
        method: moveIn.paymentMethod,
        recordedById: ctx.userId,
        at: now,
      });
    }
    await refreshPaymentStatus(tx, ledgerTenancy, now);
  }

  const created = [
    { label: "Residents moved in", count: plan.moveIns.length },
    { label: "New tenant records", count: newTenants },
    { label: "Returning residents", count: returning },
    { label: "Rooms created", count: structure.rooms },
    { label: "Beds created", count: structure.beds },
    { label: "Floors created", count: structure.floors },
    { label: "Blocks created", count: structure.blocks },
  ];
  return created.filter((entry) => entry.count > 0);
}
