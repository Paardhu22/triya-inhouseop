import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TenantsClient } from "@/components/tenants/tenants-client";
import { PageHeader } from "@/components/shell/page-header";
import { getTenants } from "@/lib/queries/tenants";
import { getSelectedPropertyId } from "@/lib/property";

export const metadata: Metadata = {
  title: "Tenants",
};

export default async function TenantsPage() {
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) redirect("/select-property");

  const tenants = await getTenants(propertyId);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tenants"
        description="Every current and past tenant in this property."
      />
      <TenantsClient tenants={tenants} />
    </div>
  );
}
