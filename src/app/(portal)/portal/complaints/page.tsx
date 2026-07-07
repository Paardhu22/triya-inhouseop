import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { format } from "date-fns";

import { auth } from "@/auth";
import { PageHeader } from "@/components/shell/page-header";
import { FileComplaintForm } from "@/components/portal/file-complaint-form";
import { getTenantByUserId } from "@/lib/queries/portal";

export const metadata: Metadata = { title: "My Complaints" };

export default async function PortalComplaintsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getTenantByUserId(session.user.id);
  if (!tenant) redirect("/login");

  return (
    <div className="space-y-8">
      <PageHeader title="Complaints" description="File a new complaint or check on an existing one." />

      <FileComplaintForm />

      <section className="space-y-4">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Your complaints
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {tenant.complaints.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No complaints filed yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Title</th>
                  <th className="px-4 py-2 text-left font-medium">Filed</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tenant.complaints.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2">{c.title}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {format(new Date(c.createdAt), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-2">{c.status}</td>
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
