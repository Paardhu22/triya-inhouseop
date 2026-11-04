"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarContent } from "./sidebar";
import { UserMenu } from "./user-menu";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PropertyLogo } from "@/components/property/property-logo";
import { selectProperty } from "@/lib/actions/property";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type PropertyItem = { id: string; name: string; city: string | null; logoKey?: string | null };

type Props = {
  property: PropertyItem;
  properties: PropertyItem[];
  user: { name?: string | null; email?: string | null; role: string };
};

function PropertyIdentity({ property }: { property: PropertyItem }) {
  return (
    <>
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-inset ring-primary/10">
        <PropertyLogo
          logoKey={property.logoKey}
          name={property.name}
          className="size-7 rounded object-contain"
          iconClassName="size-5 text-primary"
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-[17px] font-semibold leading-6 text-foreground" title={property.name}>
          {property.name}
        </span>
        {property.city ? (
          <span className="truncate text-[14px] font-normal leading-5 text-muted-foreground" title={property.city}>
            {property.city}
          </span>
        ) : null}
      </span>
    </>
  );
}

const propertyCardClassName = "flex h-auto min-h-14 w-64 min-w-0 max-w-[calc(100vw-9rem)] items-center gap-3 rounded-xl border border-border bg-card px-3 py-1.5 shadow-2xs sm:w-72";

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
    <header className="sticky top-0 z-20 mx-5 flex h-[4.5rem] shrink-0 items-center gap-2 border-b border-border bg-background/95 backdrop-blur-md sm:mx-8 lg:mx-12">
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
              className={cn(propertyCardClassName, "group/property hover:border-primary/30 hover:bg-primary/4 aria-expanded:border-primary/40 aria-expanded:bg-primary/4")}
              disabled={isPending}
              aria-label={`Switch property, current property: ${property.name}`}
              aria-busy={isPending}
            >
              <PropertyIdentity property={property} />
              {isPending ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
              ) : (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded/property:rotate-180" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={8} className="w-80 max-w-[calc(100vw-2rem)] rounded-xl p-1.5">
            {properties.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => handleSelectProperty(p.id)}
                disabled={isPending}
                className={cn("flex min-h-16 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2", p.id === property.id && "bg-primary/6")}
              >
                <PropertyIdentity property={p} />
                {p.id === property.id && (
                  <>
                    <Check aria-hidden="true" className="ml-auto size-4 shrink-0 text-primary" />
                    <span className="sr-only">Current property</span>
                  </>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className={propertyCardClassName}>
          <PropertyIdentity property={property} />
        </div>
      )}

      <div className="ml-auto">
        <UserMenu user={user} />
      </div>
    </header>
  );
}
