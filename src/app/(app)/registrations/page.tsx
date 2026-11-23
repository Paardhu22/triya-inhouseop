import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RegistrationsClient } from "@/components/registrations/registrations-client";
import { PageHeader } from "@/components/shell/page-header";
import { getActiveProperty } from "@/lib/property";
import { canReviewRegistrations } from "@/lib/registrations/permissions";
import { getRegistrationCounts, getRegistrations, getVacantBeds } from "@/lib/queries/registrations";
import type { RegistrationStatus } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Registrations",
};

const STATUSES: RegistrationStatus[] = ["PENDING", "APPROVED", "REJECTED", "EXPIRED"];

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const property = await getActiveProperty();
  if (!property) redirect("/select-property");

  // View/review/approve/reject are ADMIN/MANAGER only (STAFF keep manual tenant management).
  const role = (await auth())?.user?.role;
  if (!canReviewRegistrations(role)) redirect("/dashboard");

  const { status: raw } = await searchParams;
  const status = (STATUSES as string[]).includes(raw ?? "") ? (raw as RegistrationStatus) : raw === "ALL" ? "ALL" : "PENDING";

  const [requests, counts, beds] = await Promise.all([
    getRegistrations(property.id, status),
    getRegistrationCounts(property.id),
    status === "PENDING" ? getVacantBeds(property.id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Registrations"
        description="Tenants who registered on the public website. Review a request, pick a vacant bed, and save it as a tenant."
      />
      <RegistrationsClient
        status={status}
        requests={requests}
        counts={counts}
        beds={beds}
        isFlat={property.isFlat}
        canReject
        isAdmin={role === "ADMIN"}
        websiteSlug={property.websiteSlug}
      />
    </div>
  );
}
