import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { format } from "date-fns";

import { AdminClient } from "@/components/admin/admin-client";
import { AddOwnedPropertyWizard } from "@/components/property/add-owned-property-wizard";
import { PageHeader } from "@/components/shell/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireRoleOrRedirect } from "@/lib/auth-guard";
import { formatINR } from "@/lib/money";
import { getActiveProperty, listProperties } from "@/lib/property";
import { getAdminPropertyConfig } from "@/lib/queries/admin";
import { getComplaints } from "@/lib/queries/complaints";
import { getDashboardData } from "@/lib/queries/dashboard";

export const metadata: Metadata = { title: "Owner Dashboard" };

// Complaints unresolved for more than this many days are flagged for the owner
// as a sign the manager may not be keeping up.
const STALE_COMPLAINT_DAYS = 3;

export default async function OwnerDashboardPage() {
  await requireRoleOrRedirect(["PROPERTY_OWNER"]);

  const property = await getActiveProperty();
  if (!property) redirect("/select-property");

  const [data, complaints, myProperties, structureConfig] = await Promise.all([
    getDashboardData(property.id),
    getComplaints(property.id),
    listProperties(),
    getAdminPropertyConfig(property.id),
  ]);

  const openComplaints = complaints.filter((c) => c.status !== "RESOLVED");
  const now = new Date().getTime();
  const staleComplaints = openComplaints.filter(
    (c) => (now - new Date(c.createdAt).getTime()) / 86_400_000 > STALE_COMPLAINT_DAYS,
  );
  const resolvedCount = complaints.length - openComplaints.length;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Owner Dashboard"
        description={`Monitoring ${property.name}. Switch properties from the top bar.`}
        actions={<AddOwnedPropertyWizard />}
      />

      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          My properties ({myProperties.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          {myProperties.map((p) => (
            <span
              key={p.id}
              className={`rounded-full border px-3 py-1 text-xs ${
                p.id === property.id ? "border-primary bg-primary/10 font-medium" : "border-input text-muted-foreground"
              }`}
            >
              {p.name}
              {p.city ? ` · ${p.city}` : ""}
            </span>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Occupancy"
          value={`${data.occupiedBeds}/${data.totalBeds}`}
          hint={`${data.totalRooms} rooms`}
        />
        <StatCard label="Collections (month)" value={formatINR(data.monthlyCollections)} />
        <StatCard label="Expenses (month)" value={formatINR(data.monthlyExpenses)} />
        <StatCard
          label="Complaints"
          value={openComplaints.length}
          hint={`${resolvedCount} resolved · ${staleComplaints.length} unresolved 3+ days`}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Complaint resolution
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {complaints.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No complaints yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Title</th>
                  <th className="px-4 py-2 text-left font-medium">Raised</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Assigned to</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {complaints.slice(0, 15).map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2">{c.title}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {format(new Date(c.createdAt), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-2">{c.status}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {c.assignedTo?.name ?? "Unassigned"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Manage/resolve complaints in full from the Complaints page. Invoices are under Collections.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {property.name}&apos;s structure
        </h2>
        <AdminClient config={structureConfig} />
      </section>
    </div>
  );
}
