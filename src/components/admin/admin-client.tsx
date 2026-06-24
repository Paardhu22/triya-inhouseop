"use client";

import { useMemo, useState } from "react";
import { BedDouble } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminPropertyConfig } from "@/lib/queries/admin";
import { PropertyStructureActions } from "./property-structure-actions";
import { RoomCapacityDialog } from "./room-capacity-dialog";

export function AdminClient({ config }: { config: AdminPropertyConfig }) {
  const [floorId, setFloorId] = useState(config.floors[0]?.id ?? "");
  const floor = useMemo(
    () => config.floors.find((item) => item.id === floorId) ?? config.floors[0],
    [config.floors, floorId],
  );
  const roomCount = config.floors.reduce((sum, item) => sum + item.rooms.length, 0);
  const bedCount = config.floors.reduce(
    (sum, item) => sum + item.rooms.reduce((roomSum, room) => roomSum + room.beds.length, 0),
    0,
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-3">
        <Summary value={config.floors.length} label="Floors" />
        <Summary value={roomCount} label={config.slug === "cozy-gowlidoddy" ? "Flats" : "Rooms"} />
        {config.slug !== "cozy-gowlidoddy" ? (
          <Summary value={bedCount} label="Beds" />
        ) : null}
      </div>

      <Card>
        <CardHeader className="border-b sm:grid-cols-[1fr_auto]">
          <div>
            <CardTitle>Property structure</CardTitle>
            <CardDescription>
              Reusable templates define new floors. Existing room capacity can be adjusted independently.
            </CardDescription>
          </div>
          <PropertyStructureActions config={config} />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {config.floorTemplates.map((template) => (
            <div key={template.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {template.roomTemplates.length} rooms · used by {template._count.floors} floors
                  </p>
                </div>
                <Badge variant="secondary">Template</Badge>
              </div>
              {template.description ? (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1">
                {template.roomTemplates.map((room) => (
                  <span key={room.id} className="rounded border bg-muted/40 px-1.5 py-0.5 text-[11px] tabular-nums">
                    {config.slug === "cozy-gowlidoddy" ? "Flat" : room.sharingType}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {config.floorTemplates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Create a template before adding floors.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b sm:grid-cols-[1fr_auto]">
          <div>
            <CardTitle>{config.slug === "cozy-gowlidoddy" ? "Flat management" : "Room capacity"}</CardTitle>
            <CardDescription>
              {config.slug === "cozy-gowlidoddy"
                ? "Manage configurations of flats."
                : "Occupied beds cannot be deleted during capacity changes."}
            </CardDescription>
          </div>
          {config.floors.length > 0 ? (
            <Select value={floor?.id} onValueChange={setFloorId}>
              <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {config.floors.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.block ? `Block ${item.block.name} · ` : ""}{item.name ?? `Floor ${item.number}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </CardHeader>
        <CardContent>
          {floor ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {floor.rooms.map((room) => {
                const occupied = room.beds.filter((bed) => bed.status === "OCCUPIED").length;
                return (
                  <div key={room.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                      <BedDouble className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {config.slug === "cozy-gowlidoddy" ? `Flat ${room.number}` : `Room ${room.number}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {config.slug === "cozy-gowlidoddy"
                          ? occupied > 0 ? "Occupied" : "Available"
                          : `${room.beds.length} sharing · ${occupied} occupied`}
                      </p>
                    </div>
                    <RoomCapacityDialog room={room} />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No floors configured yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({ value, label }: { value: number; label: string }) {
  return (
    <div className="border-t border-border pt-4">
      <p className="text-3xl font-bold tracking-tight tabular-nums">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

