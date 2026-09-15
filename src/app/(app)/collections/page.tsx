import type { Metadata } from "next";
import { format, startOfMonth, subMonths } from "date-fns";

import { auth } from "@/auth";
import { CollectionsClient } from "@/components/collections/collections-client";
import { RemindEveryoneButton } from "@/components/collections/remind-everyone-button";
import { RemindPendingButton } from "@/components/collections/remind-pending-button";
import { PageHeader } from "@/components/shell/page-header";
import { getCollectionsData } from "@/lib/queries/collections";
import { getInvoiceHistory } from "@/lib/queries/invoices";
import { requireActiveProperty } from "@/lib/property";

export const metadata: Metadata = {
  title: "Collections",
};

/** Months offered in the dues month picker, newest first. */
const MONTH_OPTIONS = 24;

/** `YYYY-MM` → first of that month; anything invalid or in the future → this month. */
function resolveMonth(month: string | undefined, current: Date): Date {
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    const [year, m] = month.split("-").map(Number);
    const parsed = new Date(year, m - 1, 1);
    if (parsed <= current) return parsed;
  }
  return current;
}

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const property = await requireActiveProperty();
  const current = startOfMonth(new Date());
  const selected = resolveMonth((await searchParams).month, current);
  const isCurrentMonth = selected.getTime() === current.getTime();

  const [session, rows, invoices] = await Promise.all([
    auth(),
    getCollectionsData(property.id, selected),
    getInvoiceHistory(property.id),
  ]);
  // Reminders always describe today's position, whichever month is being viewed.
  const currentRows = isCurrentMonth ? rows : await getCollectionsData(property.id);
  const pendingCount = currentRows.filter((r) => r.outstandingPaise > 0).length;

  const role = session?.user?.role;
  const canDelete = role === "ADMIN" || role === "MANAGER";

  const monthOptions = Array.from({ length: MONTH_OPTIONS }, (_, i) => {
    const m = subMonths(current, i);
    return { value: format(m, "yyyy-MM"), label: format(m, "MMMM yyyy") };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Collections"
        description="Rent and maintenance dues for every active tenant in this property."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RemindPendingButton count={pendingCount} />
            <RemindEveryoneButton />
          </div>
        }
      />
      <CollectionsClient
        rows={rows}
        invoices={invoices}
        canDelete={canDelete}
        month={format(selected, "yyyy-MM")}
        monthOptions={monthOptions}
        isCurrentMonth={isCurrentMonth}
        isFlat={property.isFlat}
      />
    </div>
  );
}
