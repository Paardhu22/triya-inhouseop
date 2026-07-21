"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { ADMIN_NAV, MAIN_NAV, type NavItem } from "./nav-config";

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
  const secondaryNav = ADMIN_NAV.filter((item) => item.href !== "/admin" || role === "ADMIN");
  return (
    <div className="flex h-full flex-col px-3 py-6">
      <div className="mb-8 flex h-12 items-center px-3">
        <span className="font-alex-brush text-5xl leading-none text-foreground pb-1">
          Triya
        </span>
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
