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

import { useTransition } from "react";
import { ChevronDown, Loader2, Check } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PropertyLogo } from "@/components/property/property-logo";
import { selectProperty } from "@/lib/actions/property";
import { toast } from "sonner";

type PropertyItem = { id: string; name: string; city: string | null; logoKey?: string | null };

type Props = {
  property: PropertyItem;
  properties: PropertyItem[];
  user: { name?: string | null; email?: string | null; role: string };
};

export function Topbar({ property, properties, user }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Only admins reach more than one property; a property manager is locked to theirs,
  // so there is nothing to switch to — show it as a static label instead of a menu.
  const canSwitch = properties.length > 1;

  const handleSelectProperty = (propertyId: string) => {
    if (propertyId === property.id) return;
    startTransition(async () => {
      const res = await selectProperty(propertyId);
      if (!res.ok) {
        toast.error(res.error || "Failed to switch property");
      } else {
        toast.success("Switched property successfully");
      }
    });
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background px-4">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent role={user.role} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {canSwitch ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="flex min-w-[160px] sm:min-w-[200px] h-10 items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-border bg-card shadow-2xs hover:bg-muted/50"
              disabled={isPending}
            >
              <PropertyLogo
                logoKey={property.logoKey}
                name={property.name}
                className="h-6 w-6 shrink-0 rounded object-contain"
                iconClassName="size-4 shrink-0"
              />
              <div className="flex flex-col items-start min-w-0 text-left">
                <span className="truncate text-xs font-semibold leading-none text-foreground">{property.name}</span>
                {property.city ? (
                  <span className="truncate text-[10px] text-muted-foreground mt-0.5">{property.city}</span>
                ) : null}
              </div>
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0 ml-1" />
              ) : (
                <ChevronDown className="size-3.5 text-muted-foreground shrink-0 ml-1" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[240px]">

            {properties.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => handleSelectProperty(p.id)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <PropertyLogo
                  logoKey={p.logoKey}
                  name={p.name}
                  className="size-5 shrink-0 rounded object-contain"
                  iconClassName="size-4 shrink-0"
                />
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  {p.city && <span className="truncate text-xs text-muted-foreground">{p.city}</span>}
                </div>
                {p.id === property.id && (
                  <Check className="size-4 ml-auto text-primary shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="flex min-w-[160px] sm:min-w-[200px] h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 shadow-2xs">
          <PropertyLogo
            logoKey={property.logoKey}
            name={property.name}
            className="h-6 w-6 shrink-0 rounded object-contain"
            iconClassName="size-4 shrink-0"
          />
          <div className="flex flex-col items-start min-w-0 text-left">
            <span className="truncate text-xs font-semibold leading-none text-foreground">{property.name}</span>
            {property.city ? (
              <span className="truncate text-[10px] text-muted-foreground mt-0.5">{property.city}</span>
            ) : null}
          </div>
        </div>
      )}

      <div className="ml-auto">
        <UserMenu user={user} />
      </div>
    </header>
  );
}
