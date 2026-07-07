import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { format } from "date-fns";

import { auth } from "@/auth";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/shell/page-header";
import { formatINR } from "@/lib/money";
import { getTenantByUserId } from "@/lib/queries/portal";

export const metadata: Metadata = { title: "My Dashboard" };

export default async function PortalDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getTenantByUserId(session.user.id);
  if (!tenant) redirect("/login");

  const tenancy = tenant.tenancies[0];
  const dueAmount = tenancy && tenancy.paymentStatus !== "PAID"
    ? tenancy.monthlyRent + tenancy.maintenanceCharge
    : 0;

  return (
    <div className="space-y-10">
      <PageHeader title={`Welcome, ${tenant.fullName}`} description={tenant.property.name} />

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Room / bed"
          value={tenancy ? `${tenancy.bed.room.number} · ${tenancy.bed.label}` : "—"}
        />
        <StatCard
          label="This month"
          value={tenancy ? formatINR(tenancy.monthlyRent + tenancy.maintenanceCharge) : "—"}
        />
        <StatCard
          label="Due now"
          value={formatINR(dueAmount)}
          hint={tenancy?.paymentStatus === "PAID" ? "All paid up" : tenancy?.paymentStatus}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Payment history
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {tenant.payments.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Month</th>
                  <th className="px-4 py-2 text-left font-medium">Amount</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tenant.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2">{format(new Date(p.forMonth), "MMM yyyy")}</td>
                    <td className="px-4 py-2 tabular-nums">{formatINR(p.amount)}</td>
                    <td className="px-4 py-2">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
