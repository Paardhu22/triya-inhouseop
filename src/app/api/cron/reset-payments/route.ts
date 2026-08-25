import { NextResponse } from "next/server";
import { startOfMonth } from "date-fns";

import { prisma } from "@/lib/prisma";
import { monthlyDuePaise, resolvePaymentStatus } from "@/lib/rent";
import type { PaymentStatus } from "@/generated/prisma/client";

// Rolls the current-cycle payment snapshot on every active tenancy so a new rent cycle
// shows as due. `Tenancy.paymentStatus` is a denormalized view of the ledger, refreshed
// whenever money is recorded — but nothing writes on the 1st of the month, so this job
// re-derives it on a schedule.
//
// The status is computed exactly the same way as everywhere else (src/lib/rent.ts):
// from what has been collected for the CURRENT month against what is owed. That also
// makes the job promote a tenancy to OVERDUE once its due day has passed, which the
// previous "last payment is a month old" heuristic could never do.
//
// Called by an external scheduler — the /api path is excluded from the proxy, so this
// handler is NOT behind the app's session auth; it authenticates with a shared
// CRON_SECRET bearer token and fails closed when that secret is unset.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const month = startOfMonth(new Date());
    const now = new Date();

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

    return NextResponse.json({
      message: "Payment reset job completed successfully",
      scanned: tenancies.length,
      updatedCount,
    });
  } catch (error) {
    console.error("Cron error resetting payments:", error);
    return NextResponse.json(
      { error: "Internal server error during payment reset job" },
      { status: 500 },
    );
  }
}
