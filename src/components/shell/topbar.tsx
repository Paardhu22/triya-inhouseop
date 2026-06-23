"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarContent } from "./sidebar";
import { UserMenu } from "./user-menu";

type Props = {
  property: { name: string; city: string | null };
  user: { name?: string | null; email?: string | null; role: string };
};

export function Topbar({ property, user }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-neutral-200 bg-white px-4">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent role={user.role} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-sm font-semibold">{property.name}</span>
        {property.city ? (
          <span className="truncate text-xs text-muted-foreground">{property.city}</span>
        ) : null}
      </div>

      <div className="ml-auto">
        <UserMenu user={user} />
      </div>
    </header>
  );
}
