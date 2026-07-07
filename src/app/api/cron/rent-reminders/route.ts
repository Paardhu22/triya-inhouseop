import { NextResponse } from "next/server";

import { sendRentReminder } from "@/lib/aisensy";
import { formatINR } from "@/lib/money";
import { prisma } from "@/lib/prisma";

// Sends a WhatsApp rent reminder 5 days before, 2 days before, and every day on/after
// the due date until the tenant pays. Meant to be called once a day by an external
// scheduler — the /api path is excluded from the proxy, so this handler is NOT behind
// the app's session auth; it authenticates with a shared CRON_SECRET bearer token and
// fails closed when that secret is unset (same pattern as /api/cron/reset-payments).
const REMINDER_DAYS_BEFORE = new Set([5, 2]);

function daysUntilDue(dueDay: number, today: Date): number {
  const dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay, 0, 0, 0, 0);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  return Math.round((dueDate.getTime() - todayStart.getTime()) / 86_400_000);
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const today = new Date();
    const tenancies = await prisma.tenancy.findMany({
      where: {
        status: "ACTIVE",
        paymentStatus: { in: ["PENDING", "OVERDUE"] },
        paymentDueDay: { not: null },
      },
      select: {
        id: true,
        monthlyRent: true,
        maintenanceCharge: true,
        paymentDueDay: true,
        tenant: { select: { fullName: true, phone: true } },
      },
    });

    let sent = 0;
    let skipped = 0;
    for (const tenancy of tenancies) {
      const dueDay = tenancy.paymentDueDay;
      if (!dueDay) continue;
      const diff = daysUntilDue(dueDay, today);
      const shouldRemind = REMINDER_DAYS_BEFORE.has(diff) || diff <= 0;
      if (!shouldRemind) continue;

      const result = await sendRentReminder({
        phone: tenancy.tenant.phone,
        userName: tenancy.tenant.fullName,
        amountLabel: formatINR(tenancy.monthlyRent + tenancy.maintenanceCharge),
        daysUntilDue: diff,
      });
      if (result.ok) sent += 1;
      else skipped += 1;
    }

    return NextResponse.json({ message: "Rent reminder job completed", sent, skipped });
  } catch (error) {
    console.error("Cron error sending rent reminders:", error);
    return NextResponse.json({ error: "Internal server error during rent reminder job" }, { status: 500 });
  }
}
