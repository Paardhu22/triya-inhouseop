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
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-full border border-transparent px-4 py-2.5 text-[0.8125rem] font-medium transition-[color,background-color,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "border-border/60 bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-xs"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
      )}
    >
      <Icon className={cn("size-[17px] shrink-0", active && "text-primary")} strokeWidth={1.7} />
      <span className="truncate leading-normal">
        {item.label}
      </span>
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
    <div className="flex h-full flex-col overflow-y-auto px-5 py-8">
      <div className="mb-8 flex h-12 shrink-0 items-center px-4">
        <Image
          src="/logo-removebg-preview.png"
          alt="Triya Group of Hospitality"
          width={865}
          height={288}
          className="h-auto w-40 max-w-full object-contain"
        />
      </div>

      <p className="mb-2 px-4 text-[0.6875rem] font-medium text-muted-foreground">Workspace</p>
      <nav aria-label="Workspace" className="flex flex-col gap-1">
        {MAIN_NAV.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="mx-4 my-5 h-px shrink-0 bg-sidebar-border" />

      <nav aria-label="Management" className="flex flex-col gap-1">
        {secondaryNav.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
    </div>
  );
}

export function DesktopSidebar({ role }: { role: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:block">
      <SidebarContent role={role} />
    </aside>
  );
}
