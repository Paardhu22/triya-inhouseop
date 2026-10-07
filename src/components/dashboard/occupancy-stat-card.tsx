"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { DashboardOccupancyEntry } from "@/lib/queries/dashboard";

type OccupancyRow = { entry: DashboardOccupancyEntry; beds: string[] };

function locationLabel(entry: DashboardOccupancyEntry) {
  return `${entry.blockName ? `Block ${entry.blockName} · ` : ""}${entry.floorName}`;
}

function floorHref(entry: DashboardOccupancyEntry) {
  const params = new URLSearchParams({ floor: entry.floorId });
  if (entry.blockId) params.set("block", entry.blockId);
  return `/floor-manager?${params}`;
}

function roomLabel(entry: DashboardOccupancyEntry, isFlat: boolean) {
  return isFlat ? `Flat ${entry.roomNumber}` : `Room ${entry.roomNumber}`;
}

/** Vacancies are easier to browse by room than as a separate row for every bed. */
function directoryRows(entries: DashboardOccupancyEntry[], groupRooms: boolean): OccupancyRow[] {
  if (!groupRooms) return entries.map((entry) => ({ entry, beds: [entry.bedLabel] }));
  const rooms = new Map<string, OccupancyRow>();
  for (const entry of entries) {
    const room = rooms.get(entry.roomNumber);
    if (room) room.beds.push(entry.bedLabel);
    else rooms.set(entry.roomNumber, { entry, beds: [entry.bedLabel] });
  }
  return [...rooms.values()];
}

export function OccupancyStatCard({
  label, value, hint, entries, isFlat,
}: {
  label: "Occupied" | "Available";
  value: number;
  hint: string;
  entries: DashboardOccupancyEntry[];
  isFlat: boolean;
}) {
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [floor, setFloor] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const occupied = label === "Occupied";
  const unit = isFlat ? "flats" : "beds";
  const floors = [...new Map(entries.map((entry) => [entry.floorId, entry])).values()];
  const query = search.trim().toLocaleLowerCase();
  const hasFilters = query.length > 0 || floor !== "all";
  const filtered = entries.filter((entry) =>
    (floor === "all" || entry.floorId === floor) &&
    [
      roomLabel(entry, isFlat),
      isFlat ? "" : `Bed ${entry.bedLabel}`,
      locationLabel(entry),
      entry.tenant?.fullName ?? "",
    ].join(" ").toLocaleLowerCase().includes(query),
  );
  const groups = new Map<string, { location: string; rows: OccupancyRow[] }>();
  for (const row of directoryRows(filtered, !occupied && !isFlat)) {
    const group = groups.get(row.entry.floorId);
    if (group) group.rows.push(row);
    else groups.set(row.entry.floorId, { location: locationLabel(row.entry), rows: [row] });
  }
  const roomCount = new Set(entries.map((entry) => entry.roomNumber)).size;

  function clearFilters() {
    setSearch("");
    setFloor("all");
  }

  return (
    <Dialog onOpenChange={(open) => {
      if (!open) {
        clearFilters();
        setShowFilters(false);
      }
    }}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`View ${value} ${label.toLowerCase()} ${unit}`}
          className="group flex min-w-0 cursor-pointer flex-col justify-start rounded-lg bg-transparent py-5 text-left transition-colors hover:text-primary focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className="mt-3 truncate text-2xl font-semibold leading-none tracking-[-0.04em] text-foreground tabular-nums sm:text-[2rem]">{value}</span>
          <span className="mt-2 text-xs leading-relaxed font-normal text-muted-foreground">{hint}</span>
          <span className="mt-3 text-xs font-medium text-primary underline-offset-4 group-hover:underline">View list</span>
        </button>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[min(85dvh,44rem)] sm:max-w-xl"
      >
        <DialogHeader className="shrink-0 gap-1 border-b px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{label} {unit}</DialogTitle>
            <DialogClose asChild><Button variant="ghost">Close</Button></DialogClose>
          </div>
          <DialogDescription>
            {value} {value === 1 ? (isFlat ? "flat" : "bed") : unit}
            {!isFlat && ` in ${roomCount} ${roomCount === 1 ? "room" : "rooms"}`}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 space-y-3 border-b px-5 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Label className="sr-only" htmlFor={`${id}-search`}>Search</Label>
            <Input
              ref={searchRef}
              id={`${id}-search`}
              type="search"
              plain
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={occupied ? "Search by name or room" : "Search by room or floor"}
              className="h-10 min-w-0 flex-1"
            />
            {floors.length > 1 && (
              <Button variant="ghost" aria-expanded={showFilters} aria-controls={`${id}-filters`} onClick={() => setShowFilters(!showFilters)}>
                Filters{floor !== "all" ? " (1)" : ""}
              </Button>
            )}
          </div>
          {showFilters && (
            <div id={`${id}-filters`} className="flex items-center gap-3 duration-150 ease-out motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1">
              <Label htmlFor={`${id}-floor`}>Floor</Label>
              <Select value={floor} onValueChange={setFloor}>
                <SelectTrigger id={`${id}-floor`} className="min-w-0 flex-1">
                  <SelectValue placeholder="All floors" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="all">All floors</SelectItem>
                  {floors.map((entry) => (
                    <SelectItem key={entry.floorId} value={entry.floorId}>{locationLabel(entry)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className={hasFilters ? "flex items-center justify-between gap-2" : "sr-only"}>
            <p role="status" aria-live="polite" aria-atomic="true" className="text-xs text-muted-foreground">
              {filtered.length} of {entries.length} {unit}
            </p>
            {hasFilters && <Button variant="link" size="sm" onClick={clearFilters}>Clear</Button>}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3 sm:px-6">
          {filtered.length === 0 ? (
            <div className="space-y-2 py-12 text-center">
              <p className="font-medium">
                {entries.length === 0 ? `No ${label.toLowerCase()} ${unit} yet.` : `No matching ${unit}.`}
              </p>
              {entries.length > 0 && <p className="text-sm text-muted-foreground">Try a different search or clear your filters.</p>}
            </div>
          ) : (
            [...groups].map(([floorId, group]) => (
              <section key={floorId} aria-labelledby={`${id}-${floorId}`}>
                <h3 id={`${id}-${floorId}`} className="pt-5 pb-2 text-xs font-medium text-muted-foreground">{group.location}</h3>
                <ul className="divide-y divide-border/60">
                  {group.rows.map(({ entry, beds }) => {
                    const tenant = occupied ? entry.tenant : null;
                    const room = roomLabel(entry, isFlat);
                    return (
                      <li key={entry.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0 space-y-1">
                          <p className="break-words text-sm font-medium text-foreground">{tenant?.fullName ?? room}</p>
                          <p className="break-words text-xs text-muted-foreground">
                            {occupied ? (
                              tenant
                                ? `${room}${isFlat ? "" : ` · Bed ${entry.bedLabel}`}`
                                : `${isFlat ? "" : `Bed ${entry.bedLabel} · `}Tenant details missing`
                            ) : (
                              isFlat ? "Available" : `${beds.length === 1 ? "Bed" : "Beds"} ${beds.join(", ")}`
                            )}
                          </p>
                        </div>
                        <Button variant="ghost" asChild>
                          <Link
                            prefetch={false}
                            href={tenant ? `/tenants/${tenant.id}` : floorHref(entry)}
                            aria-label={tenant ? `View tenant ${tenant.fullName}` : `View floor for ${room.toLowerCase()}`}
                          >
                            {tenant ? "View tenant" : "View floor"}
                          </Link>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
