"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { ADMIN_NAV, MAIN_NAV, type NavItem } from "./nav-config";

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}

export function SidebarContent({
  role,
  onNavigate,
}: {
  role: string;
  onNavigate?: () => void;
}) {
  const secondaryNav = ADMIN_NAV.filter((item) => item.href !== "/admin" || role === "ADMIN");
  return (
    <div className="flex h-full flex-col px-3 py-4">
      <div className="mb-5 flex items-center gap-2.5 px-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Building2 className="size-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Triya Manager</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {MAIN_NAV.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="my-3 h-px bg-sidebar-border" />

      <nav className="flex flex-col gap-0.5">
        {secondaryNav.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
    </div>
  );
}

export function DesktopSidebar({ role }: { role: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar text-sidebar-foreground md:block">
      <SidebarContent role={role} />
    </aside>
  );
}
