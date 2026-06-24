import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PropertyStoreHydrator } from "@/components/shell/property-store-hydrator";
import { DesktopSidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { getActiveProperty, listProperties } from "@/lib/property";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const property = await getActiveProperty();
  if (!property) {
    redirect("/select-property");
  }
  
  const properties = await listProperties();

  return (
    <div className="min-h-screen bg-white">
      <DesktopSidebar role={session.user.role} />
      <div className="flex min-h-screen flex-col md:pl-64">
        <Topbar
          property={{ id: property.id, name: property.name, city: property.city }}
          properties={properties.map((p) => ({
            id: p.id,
            name: p.name,
            city: p.city,
          }))}
          user={{
            name: session.user.name,
            email: session.user.email,
            role: session.user.role,
          }}
        />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 md:px-8 md:py-8">
          <div className="min-h-[calc(100vh-7.5rem)] rounded-3xl bg-neutral-100 p-5 md:p-8">
            {children}
          </div>
        </main>
      </div>
      <PropertyStoreHydrator
        property={{
          id: property.id,
          name: property.name,
          slug: property.slug,
          hasBlocks: property.hasBlocks,
        }}
      />
    </div>
  );
}
