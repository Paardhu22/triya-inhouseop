import "server-only";

import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";

import { prisma } from "@/lib/prisma";
import {
  balancePaise,
  monthlyDuePaise,
  paymentSplit,
  resolveCollectionState,
  resolvePaymentStatus,
} from "@/lib/rent";
import type { PaymentStatus } from "@/generated/prisma/client";

/**
 * Rent reporting for one billing month, rolled up per floor, per room and per tenant.
 *
 * Two figures drive every table:
 * - **Expected** — what the tenancies occupying the property during that month owed
 *   (rent + maintenance). A tenancy counts in full for the month it overlaps; there is
 *   deliberately no pro-rating, matching how the invoices bill.
 * - **Collected** — what the payments ledger actually recorded against that month,
 *   split into cash and online.
 *
 * The two are gathered independently — collections are grouped by the payment's own
 * room, so money received from a tenancy that has since ended is never dropped.
 */

type Bucket = {
  expectedPaise: number;
  collectedPaise: number;
  cashPaise: number;
  onlinePaise: number;
  tenancies: number;
};

const emptyBucket = (): Bucket => ({
  expectedPaise: 0,
  collectedPaise: 0,
  cashPaise: 0,
  onlinePaise: 0,
  tenancies: 0,
});

/** The floor fields both roll-ups need: how to name it and how to order it. */
type FloorRef = {
  id: string;
  number: number;
  name: string | null;
  order: number;
  block: { name: string; order: number } | null;
};

function floorLabel(floor: FloorRef): string {
  const base = floor.name ?? `Floor ${floor.number}`;
  return floor.block ? `Block ${floor.block.name} · ${base}` : base;
}

/** Block order, then floor order, then floor number — zero-padded for string sorting. */
function floorSort(floor: FloorRef): string {
  return [floor.block?.order ?? 0, floor.order, floor.number]
    .map((n) => String(n).padStart(4, "0"))
    .join("-");
}

/** Parse `YYYY-MM` to the first day of that month, falling back to the current one. */
export function resolveReportMonth(month?: string): Date {
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    const [year, m] = month.split("-").map(Number);
    return new Date(year, m - 1, 1);
  }
  return startOfMonth(new Date());
}

export async function getRentReport(propertyId: string, month?: string) {
  const monthStart = resolveReportMonth(month);
  const monthEnd = endOfMonth(monthStart);
  const trendFrom = startOfMonth(subMonths(monthStart, 11));

  const locationSelect = {
    label: true,
    room: {
      select: {
        id: true,
        number: true,
        sharingType: true,
        floor: {
          select: {
            id: true,
            number: true,
            name: true,
            order: true,
            block: { select: { name: true, order: true } },
          },
        },
      },
    },
  } as const;

  const [tenancies, payments, trendRows, firstPayment, firstTenancy] = await Promise.all([
    // Every tenancy that occupied a bed at any point during the month.
    prisma.tenancy.findMany({
      where: {
        propertyId,
        checkInDate: { lte: monthEnd },
        OR: [{ checkOutDate: null }, { checkOutDate: { gte: monthStart } }],
      },
      select: {
        id: true,
        monthlyRent: true,
        maintenanceCharge: true,
        paymentDueDay: true,
        status: true,
        tenant: { select: { id: true, fullName: true } },
        bed: { select: locationSelect },
      },
    }),
    // Everything collected against the month, wherever the tenancy stands today.
    prisma.payment.findMany({
      where: { propertyId, forMonth: monthStart, status: "PAID" },
      select: {
        id: true,
        tenancyId: true,
        amount: true,
        method: true,
        cashAmount: true,
        onlineAmount: true,
        paidAt: true,
        createdAt: true,
        tenancy: { select: { bed: { select: locationSelect } } },
      },
    }),
    prisma.payment.groupBy({
      by: ["forMonth"],
      where: { propertyId, status: "PAID", forMonth: { gte: trendFrom, lte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.payment.findFirst({
      where: { propertyId },
      orderBy: { forMonth: "asc" },
      select: { forMonth: true },
    }),
    prisma.tenancy.findFirst({
      where: { propertyId },
      orderBy: { checkInDate: "asc" },
      select: { checkInDate: true },
    }),
  ]);

  // --- Roll up ------------------------------------------------------------------
  const floors = new Map<string, Bucket & { id: string; label: string; sort: string }>();
  const rooms = new Map<
    string,
    Bucket & { id: string; number: string; floorLabel: string; sharingType: number; sort: string }
  >();

  function floorBucket(floor: FloorRef) {
    let bucket = floors.get(floor.id);
    if (!bucket) {
      bucket = { ...emptyBucket(), id: floor.id, label: floorLabel(floor), sort: floorSort(floor) };
      floors.set(floor.id, bucket);
    }
    return bucket;
  }

  function roomBucket(room: {
    id: string;
    number: string;
    sharingType: number;
    floor: FloorRef;
  }) {
    let bucket = rooms.get(room.id);
    if (!bucket) {
      bucket = {
        ...emptyBucket(),
        id: room.id,
        number: room.number,
        floorLabel: floorLabel(room.floor),
        sharingType: room.sharingType,
        sort: `${floorSort(room.floor)}-${room.number}`,
      };
      rooms.set(room.id, bucket);
    }
    return bucket;
  }

  // Collections first, so a per-tenancy total is ready when the tenant rows are built.
  const collectedByTenancy = new Map<
    string,
    { collected: number; cash: number; online: number; count: number; lastPaidAt: Date | null }
  >();

  for (const p of payments) {
    const { cash, online } = paymentSplit(p);
    const at = p.paidAt ?? p.createdAt;

    const current = collectedByTenancy.get(p.tenancyId) ?? {
      collected: 0,
      cash: 0,
      online: 0,
      count: 0,
      lastPaidAt: null as Date | null,
    };
    current.collected += p.amount;
    current.cash += cash;
    current.online += online;
    current.count += 1;
    if (!current.lastPaidAt || at > current.lastPaidAt) current.lastPaidAt = at;
    collectedByTenancy.set(p.tenancyId, current);

    const room = p.tenancy.bed.room;
    for (const bucket of [floorBucket(room.floor), roomBucket(room)]) {
      bucket.collectedPaise += p.amount;
      bucket.cashPaise += cash;
      bucket.onlinePaise += online;
    }
  }

  const byTenant = tenancies
    .map((t) => {
      const room = t.bed.room;
      const expected = monthlyDuePaise(t);
      const collected = collectedByTenancy.get(t.id);
      const collectedPaise = collected?.collected ?? 0;

      for (const bucket of [floorBucket(room.floor), roomBucket(room)]) {
        bucket.expectedPaise += expected;
        bucket.tenancies += 1;
      }

      const status: PaymentStatus = resolvePaymentStatus({
        duePaise: expected,
        collectedPaise,
        paymentDueDay: t.paymentDueDay,
        month: monthStart,
      });

      return {
        tenancyId: t.id,
        tenantId: t.tenant.id,
        tenantName: t.tenant.fullName,
        roomNumber: room.number,
        bedLabel: t.bed.label,
        floorLabel: floorLabel(room.floor),
        expectedPaise: expected,
        collectedPaise,
        cashPaise: collected?.cash ?? 0,
        onlinePaise: collected?.online ?? 0,
        balancePaise: balancePaise(expected, collectedPaise),
        collectionCount: collected?.count ?? 0,
        lastPaidAt: collected?.lastPaidAt ?? null,
        status,
        state: resolveCollectionState(expected, collectedPaise),
        isActive: t.status === "ACTIVE",
      };
    })
    .sort((a, b) => a.tenantName.localeCompare(b.tenantName));

  const withDerived = <T extends Bucket>(b: T) => ({
    ...b,
    outstandingPaise: balancePaise(b.expectedPaise, b.collectedPaise),
  });

  // `sort` is an internal ordering key — drop it once the rows are in order.
  const stripSort = <T extends Bucket & { sort: string }>(b: T) => {
    const { sort, ...rest } = b;
    void sort;
    return withDerived(rest);
  };
  const byFloor = [...floors.values()].sort((a, b) => a.sort.localeCompare(b.sort)).map(stripSort);
  const byRoom = [...rooms.values()].sort((a, b) => a.sort.localeCompare(b.sort)).map(stripSort);

  const expectedPaise = byTenant.reduce((sum, t) => sum + t.expectedPaise, 0);
  const collectedPaise = payments.reduce((sum, p) => sum + p.amount, 0);

  // --- Trend: collections per month, oldest first, gaps filled with zero ----------
  const trendMap = new Map(
    trendRows.map((r) => [format(r.forMonth, "yyyy-MM"), r._sum.amount ?? 0]),
  );
  const trend = Array.from({ length: 12 }, (_, i) => {
    const m = startOfMonth(subMonths(monthStart, 11 - i));
    const key = format(m, "yyyy-MM");
    return { month: key, label: format(m, "MMM yy"), collectedPaise: trendMap.get(key) ?? 0 };
  });

  return {
    month: format(monthStart, "yyyy-MM"),
    monthLabel: format(monthStart, "MMMM yyyy"),
    availableMonths: buildMonthOptions(firstPayment?.forMonth ?? firstTenancy?.checkInDate ?? null),
    summary: {
      expectedPaise,
      collectedPaise,
      outstandingPaise: balancePaise(expectedPaise, collectedPaise),
      cashPaise: byTenant.reduce((sum, t) => sum + t.cashPaise, 0),
      onlinePaise: byTenant.reduce((sum, t) => sum + t.onlinePaise, 0),
      collectionRate: expectedPaise > 0 ? collectedPaise / expectedPaise : 0,
      tenancies: byTenant.length,
      fullyPaid: byTenant.filter((t) => t.balancePaise === 0).length,
      partiallyPaid: byTenant.filter((t) => t.balancePaise > 0 && t.collectedPaise > 0).length,
      unpaid: byTenant.filter((t) => t.collectedPaise === 0).length,
    },
    byFloor,
    byRoom,
    byTenant,
    trend,
  };
}

/**
 * Selectable months, newest first: every month from the property's first activity to
 * the current one, capped at three years so the dropdown stays usable.
 */
function buildMonthOptions(earliest: Date | null): { value: string; label: string }[] {
  const now = startOfMonth(new Date());
  const floor = startOfMonth(subMonths(now, 35));
  const from = earliest && startOfMonth(earliest) > floor ? startOfMonth(earliest) : floor;

  const options: { value: string; label: string }[] = [];
  for (let m = now; m >= from; m = subMonths(m, 1)) {
    options.push({ value: format(m, "yyyy-MM"), label: format(m, "MMMM yyyy") });
  }
  return options;
}

export type RentReport = Awaited<ReturnType<typeof getRentReport>>;
export type RentReportFloorRow = RentReport["byFloor"][number];
export type RentReportRoomRow = RentReport["byRoom"][number];
export type RentReportTenantRow = RentReport["byTenant"][number];
