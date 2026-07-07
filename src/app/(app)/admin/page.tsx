import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PageHeader } from "@/components/shell/page-header";
import { PropertyOwnersManager } from "@/components/admin/property-owners-manager";
import { listPropertiesForAdmin } from "@/lib/queries/properties";
import { listPropertyOwners } from "@/lib/queries/property-owners";

export const metadata: Metadata = { title: "App Owner Console" };

// The App Owner maintains the app, not individual properties: this console is
// scoped to inviting/managing Property Owners. Property-level operations (floor
// manager, complaints, expenses, invoices) live entirely under each Property
// Owner's own dashboard.
export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "APP_OWNER") redirect("/dashboard");

  const [properties, owners] = await Promise.all([listPropertiesForAdmin(), listPropertyOwners()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="App Owner Console"
        description="Invite and manage Property Owners. Each owner creates and runs their own properties."
      />
      <PropertyOwnersManager owners={owners} properties={properties} />
    </div>
  );
}
