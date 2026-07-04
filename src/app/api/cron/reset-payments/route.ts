import { NextResponse } from "next/server";
import { subMonths } from "date-fns";

import { prisma } from "@/lib/prisma";

// Resets the current-cycle payment snapshot to PENDING for active tenancies whose last
// payment is at least a month old (or who have no payment on record yet), so the new
// rent cycle shows as due. Called by an external scheduler — the /api path is excluded
// from the proxy, so this handler is NOT behind the app's session auth; it authenticates
// with a shared CRON_SECRET bearer token and fails closed when that secret is unset.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const oneMonthAgo = subMonths(new Date(), 1);

    // ACTIVE + PAID tenancies with no payment newer than a month. `none` also matches
    // tenancies marked PAID that have no payment row at all (previously skipped).
    const targets = await prisma.tenancy.findMany({
      where: {
        status: "ACTIVE",
        paymentStatus: "PAID",
        payments: { none: { paidAt: { gt: oneMonthAgo } } },
      },
      select: { id: true },
    });

    let updatedCount = 0;
    if (targets.length > 0) {
      const { count } = await prisma.tenancy.updateMany({
        where: { id: { in: targets.map((t) => t.id) } },
        data: { paymentStatus: "PENDING" },
      });
      updatedCount = count;
    }

    return NextResponse.json({
      message: "Payment reset job completed successfully",
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
