import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { UserMenu } from "@/components/shell/user-menu";

const PORTAL_NAV = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/pay", label: "Pay Now" },
  { href: "/portal/complaints", label: "Complaints" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "TENANT") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Image src="/logo.png" alt="DAZZ Logo" width={100} height={30} className="object-contain" />
            <nav className="hidden gap-6 sm:flex">
              {PORTAL_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <UserMenu
            user={{ name: session.user.name, email: session.user.email, role: session.user.role }}
          />
        </div>
        <nav className="flex gap-4 border-t border-border px-6 py-2 sm:hidden">
          {PORTAL_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-xs font-medium text-muted-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    </div>
  );
}
