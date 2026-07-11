import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PropertyPicker } from "@/components/property/property-picker";
import { listProperties } from "@/lib/property";

export const metadata: Metadata = {
  title: "Select property",
};

export default async function SelectPropertyPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role === "TENANT") {
    redirect("/portal");
  }

  const properties = await listProperties();

  // TEMP DEBUG — remove after Vercel "no properties" investigation
  console.log("[DEBUG] /select-property session:", JSON.stringify(session));
  console.log("[DEBUG] /select-property session.user:", JSON.stringify(session.user));
  console.log("[DEBUG] /select-property properties:", JSON.stringify(properties));
  console.log("[DEBUG] /select-property properties.length:", properties.length);
  if (!session.user) {
    console.log("[DEBUG] SESSION USER MISSING");
  }
  if (properties.length === 0) {
    console.log("[DEBUG] ZERO ROWS RETURNED");
    console.log("[DEBUG] PROPERTY FILTER RETURNED EMPTY");
  }

  // Only PROPERTY_OWNER ever needs to choose — MANAGER is pinned to a single
  // property and APP_OWNER just wants straight into the dashboard, so pick a
  // property for them server-side and skip the picker entirely (as long as they
  // have at least one). Next only allows mutating cookies in a Server
  // Action/Route Handler, not a page render, hence the redirect to a route
  // handler rather than setting the cookie here.
  if (session.user.role !== "PROPERTY_OWNER" && properties.length > 0) {
    redirect("/api/auto-select-property");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#2c3040] px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <span className="text-xs font-semibold tracking-[0.18em] text-secondary-surface uppercase">
            DAZZ Manager
          </span>
          <h1 className="mt-3 text-[2rem] font-bold tracking-tight text-white">
            Select a property
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Choose which PG you want to manage. You can switch anytime from the top bar.
          </p>
        </div>
        {properties.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.04] p-6 text-center text-sm text-white/60">
            No properties are available for your account. Contact an administrator.
          </p>
        ) : (
          <PropertyPicker properties={properties} />
        )}
      </div>
    </div>
  );
}
