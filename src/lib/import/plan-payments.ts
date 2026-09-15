import "server-only";

// The rent-history importer. Writes Payment rows directly rather than going through
// settleMonth (src/lib/ledger.ts), because settleMonth deliberately clamps to what is
// still outstanding — right for collecting rent today, wrong for a receipt from 2024
// that must be recorded at the amount actually taken. Once the rows are in,
// refreshPaymentStatus re-derives each tenancy's snapshot from the ledger as usual.
import { endOfMonth, format } from "date-fns";

import type { PaymentMethod, Prisma } from "@/generated/prisma/client";
import { refreshPaymentStatus, type LedgerTenancy } from "@/lib/ledger";
import { resolveSplitPaise } from "@/lib/rent";

import { normalizeRoomNumber, phoneKey } from "./coerce";
import type { ImportDb } from "./structure-map";
import type { ImportContext, ResolvedRow } from "./types";
import {
  readDate,
  readNumber,
  readPaymentMethod,
  readPhone,
  readText,
  type CoercedRow,
} from "./validate";

type Candidate = LedgerTenancy & {
  status: "ACTIVE" | "ENDED";
  checkInDate: Date;
  checkOutDate: Date | null;
  tenantName: string;
  phoneKey: string;
  roomKey: string;
  roomNumber: string;
};

type PlannedPayment = {
  tenancyId: string;
  tenantId: string;
  amount: number;
  forMonth: Date;
  method: PaymentMethod;
  cashAmount: number;
  onlineAmount: number;
  paidAt: Date;
  notes: string | null;
};

export type PaymentsPlan = {
  rows: ResolvedRow[];
  blank: number;
  payments: PlannedPayment[];
  /** Every tenancy touched, so its snapshot can be re-derived after the writes. */
  touched: LedgerTenancy[];
};

/** Identifies one receipt, so re-running the same sheet cannot post it twice. */
function receiptKey(tenancyId: string, forMonth: Date, amount: number, paidAt: Date): string {
  return `${tenancyId}|${format(forMonth, "yyyy-MM")}|${amount}|${format(paidAt, "yyyy-MM-dd")}`;
}

export async function planPayments(
  db: ImportDb,
  ctx: ImportContext,
  coerced: CoercedRow[],
): Promise<PaymentsPlan> {
  const tenancies = await db.tenancy.findMany({
    where: { propertyId: ctx.propertyId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      monthlyRent: true,
      maintenanceCharge: true,
      paymentDueDay: true,
      checkInDate: true,
      checkOutDate: true,
      tenant: { select: { fullName: true, phone: true } },
      // Tenancy stores roomId denormalized but has no room relation — reach it via the bed.
      bed: { select: { label: true, room: { select: { number: true } } } },
    },
  });

  const candidates: Candidate[] = tenancies.map((tenancy) => ({
    id: tenancy.id,
    tenantId: tenancy.tenantId,
    monthlyRent: tenancy.monthlyRent,
    maintenanceCharge: tenancy.maintenanceCharge,
    paymentDueDay: tenancy.paymentDueDay,
    status: tenancy.status,
    checkInDate: tenancy.checkInDate,
    checkOutDate: tenancy.checkOutDate,
    tenantName: tenancy.tenant.fullName,
    phoneKey: phoneKey(tenancy.tenant.phone),
    roomKey: normalizeRoomNumber(tenancy.bed.room.number),
    roomNumber: tenancy.bed.room.number,
  }));

  const byPhone = new Map<string, Candidate[]>();
  const byRoom = new Map<string, Candidate[]>();
  const index = (map: Map<string, Candidate[]>, key: string, candidate: Candidate) => {
    const bucket = map.get(key);
    if (bucket) bucket.push(candidate);
    else map.set(key, [candidate]);
  };
  for (const candidate of candidates) {
    index(byPhone, candidate.phoneKey, candidate);
    index(byRoom, candidate.roomKey, candidate);
  }

  const existing = await db.payment.findMany({
    where: { propertyId: ctx.propertyId },
    select: { tenancyId: true, forMonth: true, amount: true, paidAt: true, createdAt: true },
  });
  const alreadyRecorded = new Set(
    existing.map((payment) =>
      receiptKey(payment.tenancyId, payment.forMonth, payment.amount, payment.paidAt ?? payment.createdAt),
    ),
  );

  const rows: ResolvedRow[] = [];
  const payments: PlannedPayment[] = [];
  const touched = new Map<string, LedgerTenancy>();
  let blank = 0;

  for (const row of coerced) {
    if (row.blank) {
      blank += 1;
      continue;
    }

    const month = readDate(row, "month");
    const who = readText(row, "tenantName") ?? readPhone(row, "phone")?.stored ?? readText(row, "roomNumber") ?? "";
    const label = [who || "(unidentified)", month ? format(month, "MMM yyyy") : null].filter(Boolean).join(" · ");
    const push = (status: ResolvedRow["status"], message: string) =>
      rows.push({ rowNumber: row.rowNumber, status, message, label });

    if (row.errors.length) {
      push("error", row.errors.join("; "));
      continue;
    }

    const amount = readNumber(row, "amount");
    if (!month || amount === null) {
      push("error", "Billing month and amount are both needed");
      continue;
    }
    if (amount <= 0) {
      push("error", "Amount must be more than zero");
      continue;
    }

    // --- Find the tenancy this receipt belongs to ---
    const phone = readPhone(row, "phone");
    const roomNumber = readText(row, "roomNumber");
    const matchedBy = phone ? "phone" : "room";
    const pool = phone
      ? (byPhone.get(phone.key) ?? [])
      : roomNumber
        ? (byRoom.get(normalizeRoomNumber(roomNumber)) ?? [])
        : [];

    if (pool.length === 0) {
      push(
        "error",
        phone
          ? `No resident in this property has the phone number ${phone.stored}`
          : `No tenancy found for room ${roomNumber ?? "(blank)"}`,
      );
      continue;
    }

    const monthEnd = endOfMonth(month);
    let covering = pool.filter(
      (candidate) =>
        candidate.checkInDate <= monthEnd && (candidate.checkOutDate === null || candidate.checkOutDate >= month),
    );
    // Nobody's recorded stay spans that month, but if the phone points at exactly one
    // person the receipt is still unambiguous — post it rather than reject the row.
    if (covering.length === 0 && pool.length === 1) covering = pool;
    if (covering.length === 0) {
      push("error", `No tenancy covering ${format(month, "MMMM yyyy")}`);
      continue;
    }
    if (covering.length > 1) {
      const active = covering.filter((candidate) => candidate.status === "ACTIVE");
      if (active.length === 1) {
        covering = active;
      } else if (matchedBy === "room") {
        push(
          "error",
          `Room ${roomNumber} had ${covering.length} residents in ${format(month, "MMMM yyyy")} — add a phone column to say who paid`,
        );
        continue;
      } else {
        covering = [...covering].sort((a, b) => b.checkInDate.getTime() - a.checkInDate.getTime()).slice(0, 1);
      }
    }
    const tenancy = covering[0];

    // --- Cash / online split ---
    const cash = readNumber(row, "cashAmount");
    const online = readNumber(row, "onlineAmount");
    let method = readPaymentMethod(row, "method");
    if (!method) {
      if (cash && online) method = "SPLIT";
      else if (online) method = "ONLINE";
      else method = "CASH";
    }
    if (method === "SPLIT" && (cash ?? 0) + (online ?? 0) !== amount) {
      push("error", "Cash and online portions do not add up to the amount collected");
      continue;
    }
    const split = resolveSplitPaise(amount, method, cash ?? 0, online ?? 0);
    const paidAt = readDate(row, "paidAt") ?? month;

    const key = receiptKey(tenancy.id, month, amount, paidAt);
    if (alreadyRecorded.has(key)) {
      push("skip", `A matching receipt for ${tenancy.tenantName} is already recorded`);
      continue;
    }
    alreadyRecorded.add(key);

    payments.push({
      tenancyId: tenancy.id,
      tenantId: tenancy.tenantId,
      amount,
      forMonth: month,
      method,
      cashAmount: split.cashAmount,
      onlineAmount: split.onlineAmount,
      paidAt,
      notes: readText(row, "notes"),
    });
    touched.set(tenancy.id, {
      id: tenancy.id,
      tenantId: tenancy.tenantId,
      monthlyRent: tenancy.monthlyRent,
      maintenanceCharge: tenancy.maintenanceCharge,
      paymentDueDay: tenancy.paymentDueDay,
    });

    push("ready", `₹${(amount / 100).toLocaleString("en-IN")} for ${tenancy.tenantName}, room ${tenancy.roomNumber}`);
  }

  return { rows, blank, payments, touched: [...touched.values()] };
}

export async function applyPayments(
  tx: Prisma.TransactionClient,
  ctx: ImportContext,
  plan: PaymentsPlan,
): Promise<{ label: string; count: number }[]> {
  if (plan.payments.length === 0) return [];

  await tx.payment.createMany({
    data: plan.payments.map((payment) => ({
      propertyId: ctx.propertyId,
      tenancyId: payment.tenancyId,
      tenantId: payment.tenantId,
      amount: payment.amount,
      forMonth: payment.forMonth,
      status: "PAID" as const,
      method: payment.method,
      cashAmount: payment.cashAmount,
      onlineAmount: payment.onlineAmount,
      paidAt: payment.paidAt,
      notes: payment.notes,
      recordedById: ctx.userId,
    })),
  });

  // The snapshot on each bed / collections row is always derived, never assumed.
  for (const tenancy of plan.touched) {
    await refreshPaymentStatus(tx, tenancy);
  }

  return [
    { label: "Collections recorded", count: plan.payments.length },
    { label: "Tenancies updated", count: plan.touched.length },
  ];
}
