import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AutoSelectProperty } from "@/components/property/auto-select-property";
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

  const properties = await listProperties();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <span className="text-xs font-semibold tracking-[0.18em] text-primary">
            Triya Manager
          </span>
          <h1 className="mt-3 text-[2.25rem] font-semibold tracking-[-0.045em] text-foreground">
            {properties.length === 1 ? "Opening your property" : "Select a property"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {properties.length === 1
              ? "Taking you to your dashboard."
              : "Choose which PG you want to manage. You can switch anytime from the top bar."}
          </p>
        </div>
        {properties.length === 0 ? (
          <p className="rounded-xl border border-border bg-muted p-6 text-center text-sm text-muted-foreground">
            No properties are available for your account. Contact an administrator.
          </p>
        ) : properties.length === 1 ? (
          <AutoSelectProperty propertyId={properties[0].id} />
        ) : (
          <PropertyPicker properties={properties} />
        )}
      </div>
    </div>
  );
}
