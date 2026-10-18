import { NextResponse } from "next/server";
import { startOfMonth, subMonths } from "date-fns";

import { prisma } from "@/lib/prisma";
import { monthlyDuePaise, resolvePaymentStatus } from "@/lib/rent";
import { storage } from "@/lib/storage";
import type { PaymentStatus } from "@/generated/prisma/client";

// Rolls the current-cycle payment snapshot on every active tenancy so a new rent cycle
// shows as due, and purges vacated tenant records whose checkout is older than 6 months.
//
// Called by Vercel Cron (GET) or an external scheduler (POST) — authenticates with a
// shared CRON_SECRET bearer token and fails closed when that secret is unset.
async function runDailyMaintenance(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const now = new Date();
    const month = startOfMonth(now);
    const sixMonthsAgo = subMonths(now, 6);

    const tenancies = await prisma.tenancy.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        monthlyRent: true,
        maintenanceCharge: true,
        paymentDueDay: true,
        paymentStatus: true,
      },
    });

    // One grouped read for the whole property set rather than a query per tenancy.
    const collected = await prisma.payment.groupBy({
      by: ["tenancyId"],
      where: {
        status: "PAID",
        forMonth: month,
        tenancyId: { in: tenancies.map((t) => t.id) },
      },
      _sum: { amount: true },
    });
    const collectedByTenancy = new Map(collected.map((c) => [c.tenancyId, c._sum.amount ?? 0]));

    // Bucket by target status so the writes are three updateMany calls, not N updates.
    const buckets = new Map<PaymentStatus, string[]>();
    for (const tenancy of tenancies) {
      const next = resolvePaymentStatus({
        duePaise: monthlyDuePaise(tenancy),
        collectedPaise: collectedByTenancy.get(tenancy.id) ?? 0,
        paymentDueDay: tenancy.paymentDueDay,
        month,
        now,
      });
      if (next === tenancy.paymentStatus) continue;
      const bucket = buckets.get(next);
      if (bucket) bucket.push(tenancy.id);
      else buckets.set(next, [tenancy.id]);
    }

    let updatedCount = 0;
    for (const [status, ids] of buckets) {
      const { count } = await prisma.tenancy.updateMany({
        where: { id: { in: ids } },
        data: { paymentStatus: status },
      });
      updatedCount += count;
    }

    // Purge vacated tenants whose ended tenancies all checked out more than 6 months ago.
    const expiredTenants = await prisma.tenant.findMany({
      where: {
        tenancies: {
          some: { status: "ENDED", checkOutDate: { lt: sixMonthsAgo } },
          none: {
            OR: [
              { status: "ACTIVE" },
              { checkOutDate: null },
              { checkOutDate: { gte: sixMonthsAgo } },
            ],
          },
        },
      },
      select: {
        id: true,
        photoUrl: true,
        documents: { select: { storageKey: true } },
        invoices: { select: { storageKey: true } },
      },
    });

    let purgedTenantsCount = 0;
    if (expiredTenants.length > 0) {
      const expiredIds = expiredTenants.map((t) => t.id);
      const keysToDelete = new Set<string>();
      for (const tenant of expiredTenants) {
        if (tenant.photoUrl) keysToDelete.add(tenant.photoUrl);
        for (const doc of tenant.documents) keysToDelete.add(doc.storageKey);
        for (const inv of tenant.invoices) keysToDelete.add(inv.storageKey);
      }

      const deleted = await prisma.tenant.deleteMany({
        where: { id: { in: expiredIds } },
      });
      purgedTenantsCount = deleted.count;

      await Promise.all(
        Array.from(keysToDelete).map((key) =>
          storage.remove(key).catch(() => undefined),
        ),
      );
    }

    return NextResponse.json({
      message: "Payment reset and 6-month retention cleanup completed successfully",
      scanned: tenancies.length,
      updatedCount,
      purgedTenantsCount,
    });
  } catch (error) {
    console.error("Cron error resetting payments:", error);
    return NextResponse.json(
      { error: "Internal server error during payment reset job" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return runDailyMaintenance(request);
}

export async function POST(request: Request) {
  return runDailyMaintenance(request);
}

