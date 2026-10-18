"use client";

import { useState } from "react";
import { IndianRupee, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoomRentDialog } from "@/components/floor/room-rent-dialog";
import { formatINR } from "@/lib/money";
import type { AdminPropertyConfig } from "@/lib/queries/admin";
import { BED_STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";
import { RoomCapacityDialog } from "./room-capacity-dialog";
import styles from "./room-management.module.css";

type Room = AdminPropertyConfig["floors"][number]["rooms"][number];

function RoomRow({ room, isFlat }: { room: Room; isFlat: boolean }) {
  const occupied = room.beds.filter((bed) => bed.status === "OCCUPIED").length;
  const occupantCount = room.beds.reduce((sum, bed) => sum + bed._count.tenancies, 0);
  const noun = isFlat ? "Flat" : "Room";
  const rent = room.defaultRent === null ? null : formatINR(room.defaultRent);

  return (
    <li className={styles.row} aria-label={`${noun} ${room.number}`}>
      <div className={styles.identity}>
        <p className="truncate text-[17px] font-semibold tracking-tight tabular-nums" title={`${noun} ${room.number}`}>{room.number}</p>
        {room.label ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={room.label}>{room.label}</p> : null}
      </div>
      <div className={styles.occupancy}>
        <p className="text-xs font-medium text-foreground">{isFlat ? "Whole flat" : room.beds.length ? `${room.beds.length} sharing` : "No beds configured"}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {room.beds.length > 0 ? (
            <span aria-hidden="true" className={cn("flex gap-0.5", isFlat ? "w-1.5" : "w-12")}>
              {room.beds.map((bed) => <span key={bed.id} title={`Bed ${bed.label}: ${BED_STATUS_META[bed.status].label}`} className={cn("h-1.5 min-w-0 flex-1 rounded-full", bed.status === "OCCUPIED" ? "bg-primary/65" : "bg-primary/10")} />)}
            </span>
          ) : null}
          <span className="text-[11px] text-muted-foreground tabular-nums">{isFlat ? occupied > 0 ? "Occupied" : room.beds.length ? "Available" : "Not configured" : `${occupied} of ${room.beds.length} occupied`}</span>
        </div>
      </div>
      <div className={styles.rent}>
        <p className={cn("truncate text-xs", rent === null ? "text-muted-foreground" : "font-medium text-foreground tabular-nums")} title={rent === null ? "Rent not set" : `${rent} per month`}>
          {rent === null ? "Rent not set" : <>{rent}<span className="ml-0.5 font-normal text-muted-foreground">/mo</span></>}
        </p>
        {room.defaultMaintenance !== null && room.defaultMaintenance > 0 ? <p className="mt-1 truncate text-[10px] text-muted-foreground" title={`${formatINR(room.defaultMaintenance)} maintenance per month`}>+ {formatINR(room.defaultMaintenance)} maintenance</p> : null}
      </div>
      <div className={styles.actions}>
        <RoomRentDialog
          room={{ id: room.id, number: room.number, defaultRent: room.defaultRent, defaultMaintenance: room.defaultMaintenance, occupantCount }}
          isFlat={isFlat}
          trigger={<Button variant="ghost" size="sm" className="px-2 text-xs text-muted-foreground hover:text-primary" aria-label={`Set rent for ${noun.toLowerCase()} ${room.number}`}><IndianRupee aria-hidden="true" className="size-3.5" />Rent</Button>}
        />
        <RoomCapacityDialog
          room={room}
          trigger={<Button variant="ghost" size="sm" className="px-2 text-xs text-muted-foreground hover:text-primary" aria-label={`Configure ${noun.toLowerCase()} ${room.number} capacity`}><Settings2 aria-hidden="true" className="size-3.5" />Capacity</Button>}
        />
      </div>
    </li>
  );
}

export function RoomManagement({ config }: { config: AdminPropertyConfig }) {
  const [floorId, setFloorId] = useState(config.floors[0]?.id ?? "");
  const floor = config.floors.find((item) => item.id === floorId) ?? config.floors[0];
  const isFlat = config.slug === "cozy-gowlidoddy";
  const bedCount = floor?.rooms.reduce((sum, room) => sum + room.beds.length, 0) ?? 0;
  const occupiedCount = floor?.rooms.reduce((sum, room) => sum + room.beds.filter((bed) => bed.status === "OCCUPIED").length, 0) ?? 0;

  return (
    <Card variant="section">
      <CardHeader className="gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <CardTitle>{isFlat ? "Flat management" : "Room capacity"}</CardTitle>
          <CardDescription className="mt-1 text-xs">{isFlat ? "Review occupancy and manage each flat's rent and capacity." : "Review sharing, occupancy, and rent for each room."}</CardDescription>
        </div>
        {config.floors.length > 0 ? (
          <Select value={floor?.id} onValueChange={setFloorId}>
            <SelectTrigger aria-label="Floor for room management" className="w-full bg-card shadow-none sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {config.floors.map((item) => <SelectItem key={item.id} value={item.id}>{item.block ? `Block ${item.block.name} · ` : ""}{item.name ?? `Floor ${item.number}`}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {floor ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground" aria-label="Selected floor totals">
              <span className="tabular-nums">{floor.rooms.length} {isFlat ? "flats" : "rooms"}{!isFlat ? ` · ${bedCount} beds` : ""} · {occupiedCount} occupied</span>
              <span className="inline-flex items-center gap-1.5 tabular-nums"><span aria-hidden="true" className="size-1.5 rounded-full bg-available" />{bedCount - occupiedCount} available</span>
            </div>
            {floor.rooms.length > 0 ? (
              <div className={styles.list}>
                <div className={styles.heading} aria-hidden="true"><span>{isFlat ? "Flat" : "Room"}</span><span>{isFlat ? "Occupancy" : "Sharing & occupancy"}</span><span>Monthly rent</span><span className="text-right">Manage</span></div>
                <ul aria-label={isFlat ? "Flats on selected floor" : "Rooms on selected floor"}>
                  {floor.rooms.map((room) => <RoomRow key={room.id} room={room} isFlat={isFlat} />)}
                </ul>
              </div>
            ) : <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No {isFlat ? "flats" : "rooms"} on this floor yet.</p>}
          </>
        ) : <p className="text-sm text-muted-foreground">No floors configured yet.</p>}
      </CardContent>
    </Card>
  );
}
