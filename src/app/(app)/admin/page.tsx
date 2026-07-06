import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AdminClient } from "@/components/admin/admin-client";
import { PropertiesManager } from "@/components/admin/properties-manager";
import { PageHeader } from "@/components/shell/page-header";
import { getSelectedPropertyId } from "@/lib/property";
import { getAdminPropertyConfig } from "@/lib/queries/admin";
import { listPropertiesForAdmin } from "@/lib/queries/properties";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const [session, propertyId] = await Promise.all([auth(), getSelectedPropertyId()]);
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (!propertyId) redirect("/select-property");

  const [config, properties] = await Promise.all([
    getAdminPropertyConfig(propertyId),
    listPropertiesForAdmin(),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin"
        description={`Manage properties and accounts, and configure ${config.name}'s floors, rooms, and beds.`}
      />
      <PropertiesManager properties={properties} />
      <AdminClient config={config} />
    </div>
  );
}

