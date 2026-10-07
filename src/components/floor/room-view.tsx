"use client";

import { ArrowRight, BedDouble } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatINR } from "@/lib/money";
import type { FloorRoom } from "@/lib/queries/floor";
import { cn } from "@/lib/utils";
import { BED_VISUAL_STATUS_META, bedVisualStatus } from "./bed-status";
import { RoomRentDialog } from "./room-rent-dialog";

const STATUS_TEXT = {
  paid: "text-emerald-700",
  pending: "text-amber-800",
  overdue: "text-rose-700",
  vacant: "text-muted-foreground",
};

function BedIllustration() {
  return (
    <div aria-hidden="true" className="relative flex h-32 items-center justify-center bg-muted/60">
      <div className="absolute bottom-4 h-2 w-20 rounded-full bg-foreground/5 blur-[3px]" />
      <div className="relative ease-[var(--ease)] motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:-translate-y-1">
        <div className="absolute -top-1.5 -right-1.5 -left-1.5 h-5 rounded-t-xl border border-primary/15 bg-grid-accent" />
        <div className="relative flex h-24 w-20 justify-center overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm">
          <div className="mt-2 h-5 w-14 rounded-md border border-border bg-background shadow-2xs" />
          <div className="absolute inset-x-0 bottom-0 h-14 rounded-b-xl border-t border-primary/15 bg-grid-accent/70">
            <div className="mt-2 h-px bg-primary/10" />
            <div className="absolute inset-y-0 right-3 w-px bg-primary/10" />
          </div>
        </div>
        <div className="absolute -bottom-1 left-2 h-1.5 w-1.5 rounded-b-sm bg-primary/30" />
        <div className="absolute -bottom-1 right-2 h-1.5 w-1.5 rounded-b-sm bg-primary/30" />
      </div>
    </div>
  );
}

function BedCard({
  bed,
  index,
  onSelect,
}: {
  bed: FloorRoom["beds"][number];
  index: number;
  onSelect: () => void;
}) {
  const status = bedVisualStatus(bed);
  const meta = BED_VISUAL_STATUS_META[status];
  const tenancy = status === "vacant" ? null : bed.tenancies[0];
  const initials = tenancy?.tenant.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Bed ${bed.label}: ${tenancy ? `view ${tenancy.tenant.fullName}` : "assign a tenant"}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-2xs outline-none transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-md focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-backwards motion-safe:ease-[var(--ease)]"
      style={{ animationDelay: `${Math.min(index, 4) * 35}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-semibold tracking-[-0.02em] text-foreground">Bed {bed.label}</span>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[0.6875rem] font-medium", meta.softBg, STATUS_TEXT[status])}>
          <span aria-hidden="true" className={cn("size-1.5 rounded-full", meta.dot)} />
          {status === "vacant" ? "Available" : meta.label}
        </span>
      </div>

      <BedIllustration />

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold", tenancy ? "bg-primary/8 text-primary" : "bg-muted text-muted-foreground")}>
            {tenancy ? initials : <BedDouble className="size-4" strokeWidth={1.5} />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground" title={tenancy?.tenant.fullName}>
              {tenancy?.tenant.fullName ?? "Ready for a move-in"}
            </p>
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
              {tenancy ? "Current tenant" : "No tenant assigned"}
            </p>
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-border/70 pt-3">
          <div className="min-w-0">
            <p className="text-[0.6875rem] text-muted-foreground">{tenancy ? "Monthly rent" : "Available bed"}</p>
            <p className={cn("mt-1 text-base font-semibold tracking-[-0.025em]", tenancy ? "text-foreground tabular-nums" : "text-muted-foreground")}>
              {tenancy ? formatINR(tenancy.monthlyRent) : "Unassigned"}
            </p>
          </div>
          <ArrowRight aria-hidden="true" className="mb-1 size-4 shrink-0 text-muted-foreground transition-[color,transform] duration-200 group-hover:text-primary motion-safe:group-hover:translate-x-0.5" />
        </div>
        <span className="text-xs font-medium text-primary">{tenancy ? "View tenant" : "Assign tenant"}</span>
      </div>
    </button>
  );
}

export function RoomView({
  room,
  onOpenChange,
  onSelectBed,
  canSetRent = false,
}: {
  room: FloorRoom | null;
  onOpenChange: (open: boolean) => void;
  onSelectBed: (bedId: string) => void;
  /** ADMIN/MANAGER may set the rent for the whole room. */
  canSetRent?: boolean;
}) {
  const occupantCount = room
    ? room.beds.reduce((sum, bed) => sum + bed.tenancies.length, 0)
    : 0;
  const occupiedBeds = room?.beds.filter((bed) => bedVisualStatus(bed) !== "vacant").length ?? 0;
  const bedCount = room?.beds.length ?? 0;

  return (
    <Dialog open={Boolean(room)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden border-border bg-background p-0 shadow-lg transition-none sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-4 border-b border-border px-5 py-5 pr-14 sm:px-6 sm:pr-14">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary">
              <BedDouble className="size-5" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 space-y-1.5">
              <DialogTitle className="leading-snug">Room {room?.number}<span aria-hidden="true" className="text-primary">.</span></DialogTitle>
              <DialogDescription>Select a bed to view or manage tenant details.</DialogDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span>{bedCount} {bedCount === 1 ? "bed" : "beds"}</span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="h-1.5 w-10 overflow-hidden rounded-full bg-primary/10">
                <span className="block h-full rounded-full bg-primary/70" style={{ width: `${bedCount ? (occupiedBeds / bedCount) * 100 : 0}%` }} />
              </span>
              {occupiedBeds} occupied
            </span>
            <span>{bedCount - occupiedBeds} available</span>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">
          {bedCount > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3 sm:gap-4">
              {room?.beds.map((bed, index) => (
                <BedCard key={bed.id} bed={bed} index={index} onSelect={() => onSelectBed(bed.id)} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-muted/60 px-4 py-10 text-center text-sm text-muted-foreground">No beds configured in this room yet.</p>
          )}
        </div>

        {room && canSetRent ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-4 sm:px-6">
            <div className="min-w-0 text-sm">
              <p className="font-medium">Room rent</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {room.defaultRent === null
                  ? "No room default — rent is set per tenant."
                  : `${formatINR(room.defaultRent)}/mo${
                      room.defaultMaintenance
                        ? ` + ${formatINR(room.defaultMaintenance)} maintenance`
                        : ""
                    }`}
              </p>
            </div>
            <RoomRentDialog
              key={room.id}
              room={{ id: room.id, number: room.number, defaultRent: room.defaultRent, defaultMaintenance: room.defaultMaintenance, occupantCount }}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
