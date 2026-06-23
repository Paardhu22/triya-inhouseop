import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PageHeader } from "@/components/shell/page-header";
import { SettingsClient } from "@/components/settings/settings-client";
import { getActiveProperty } from "@/lib/property";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [session, property] = await Promise.all([auth(), getActiveProperty()]);
  if (!session?.user) redirect("/login");
  if (!property) redirect("/select-property");
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Account security, appearance, and current property details." />
      <SettingsClient
        user={{ name: session.user.name ?? null, email: session.user.email ?? null, role: session.user.role }}
        property={{ name: property.name, slug: property.slug, address: property.address, city: property.city }}
        canManageProperty={session.user.role === "ADMIN"}
      />
    </div>
  );
}
