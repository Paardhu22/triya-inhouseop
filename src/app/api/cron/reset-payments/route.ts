import { NextResponse } from "next/server";
import { subMonths } from "date-fns";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    // Optional: Add authorization check if needed for cron service (e.g., matching a CRON_SECRET)
    // const authHeader = request.headers.get("authorization");
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return new NextResponse("Unauthorized", { status: 401 });
    // }

    // Define exactly one month ago
    const oneMonthAgo = subMonths(new Date(), 1);

    // Find all ACTIVE tenancies currently marked as PAID
    const tenancies = await prisma.tenancy.findMany({
      where: {
        status: "ACTIVE",
        paymentStatus: "PAID",
      },
      include: {
        payments: {
          orderBy: { paidAt: "desc" },
          take: 1,
        },
      },
    });

    let updatedCount = 0;

    for (const tenancy of tenancies) {
      const lastPayment = tenancy.payments[0];

      // If there's a payment and its paidAt date is exactly one month ago or older
      if (lastPayment && lastPayment.paidAt && lastPayment.paidAt <= oneMonthAgo) {
        await prisma.tenancy.update({
          where: { id: tenancy.id },
          data: { paymentStatus: "PENDING" },
        });
        updatedCount++;
      }
    }

    return NextResponse.json({
      message: "Payment reset job completed successfully",
      updatedCount,
    });
  } catch (error) {
    console.error("Cron error resetting payments:", error);
    return NextResponse.json(
      { error: "Internal server error during payment reset job" },
      { status: 500 }
    );
  }
}
