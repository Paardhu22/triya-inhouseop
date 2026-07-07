"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  APP_OWNER_NAV,
  APP_OWNER_PROPERTY_VIEW_NAV,
  APP_OWNER_PROPERTY_VIEW_PATHS,
  MAIN_NAV,
  OWNER_NAV,
  SETTINGS_NAV,
  type NavItem,
} from "./nav-config";

import { motion } from "motion/react";
import TextRoll from "@/components/ui/text-roll";

const MotionLink = motion(Link);

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <MotionLink
      href={item.href}
      onClick={onNavigate}
      initial="initial"
      whileHover="hovered"
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
          : "text-sidebar-foreground/55 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2 : 1.75} />
      <TextRoll
        className={cn(
          "bg-transparent text-inherit",
          active ? "text-sidebar-accent-foreground font-semibold" : "text-sidebar-foreground/55"
        )}
      >
        {item.label}
      </TextRoll>
    </MotionLink>
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
  const pathname = usePathname();
  // An App Owner browsing into a specific property (e.g. via "View property" on an
  // owner's detail page) sees the same operational nav a Manager sees, with a way
  // back to the console — otherwise they see the platform-wide console nav.
  const isAppOwnerViewingProperty =
    role === "APP_OWNER" &&
    APP_OWNER_PROPERTY_VIEW_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const primaryNav =
    role === "PROPERTY_OWNER"
      ? OWNER_NAV
      : role === "APP_OWNER"
        ? isAppOwnerViewingProperty
          ? APP_OWNER_PROPERTY_VIEW_NAV
          : APP_OWNER_NAV
        : MAIN_NAV;
  // OWNER_NAV and APP_OWNER_NAV already include their own Settings entry; the
  // property-view nav intentionally omits Settings too (it's a temporary lens).
  const secondaryNav = role === "PROPERTY_OWNER" || role === "APP_OWNER" ? [] : SETTINGS_NAV;
  return (
    <div className="flex h-full flex-col px-3 py-6">
      <div className="mb-8 flex h-12 items-center px-3">
        <Image
          src="/logo.png"
          alt="DAZZ Logo"
          width={160}
          height={48}
          className="object-contain"
        />
      </div>

      <nav className="flex flex-col gap-0.5">
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      {secondaryNav.length > 0 ? (
        <>
          <div className="my-4 h-px bg-sidebar-border" />
          <nav className="flex flex-col gap-0.5">
            {secondaryNav.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </nav>
        </>
      ) : null}
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
