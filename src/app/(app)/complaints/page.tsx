import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ComplaintsClient } from "@/components/complaints/complaints-client";
import { PageHeader } from "@/components/shell/page-header";
import { getAssignableUsers, getComplaints } from "@/lib/queries/complaints";
import { getSelectedPropertyId } from "@/lib/property";

export const metadata: Metadata = {
  title: "Complaints",
};

export default async function ComplaintsPage() {
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) redirect("/select-property");

  const [complaints, users] = await Promise.all([
    getComplaints(propertyId),
    getAssignableUsers(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Complaints"
        description="Track and resolve resident complaints across the property."
      />
      <ComplaintsClient complaints={complaints} users={users} />
    </div>
  );
}
