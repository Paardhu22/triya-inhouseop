"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/55 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2 : 1.75} />
      {item.label}
    </Link>
  );
}

import Image from "next/image";

export function SidebarContent({
  role,
  onNavigate,
}: {
  role: string;
  onNavigate?: () => void;
}) {
  const secondaryNav = ADMIN_NAV.filter((item) => item.href !== "/admin" || role === "ADMIN");
  return (
    <div className="flex h-full flex-col px-3 py-6">
      <div className="mb-8 flex h-12 items-center px-3">
        <Image 
          src="/logo.png" 
          alt="Triya Logo" 
          width={160} 
          height={48} 
          className="object-contain"
        />
      </div>

      <nav className="flex flex-col gap-0.5">
        {MAIN_NAV.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="my-4 h-px bg-sidebar-border" />

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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-sidebar text-sidebar-foreground md:block">
      <SidebarContent role={role} />
    </aside>
  );
}
