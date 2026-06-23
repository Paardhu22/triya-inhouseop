"use client";

import { useMemo, useState } from "react";
import { BedDouble, Building2, Layers3 } from "lucide-react";

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
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary icon={Building2} value={config.floors.length} label="Floors" />
        <Summary icon={Layers3} value={roomCount} label="Rooms" />
        <Summary icon={BedDouble} value={bedCount} label="Beds" />
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
                    {room.sharingType}
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
            <CardTitle>Room capacity</CardTitle>
            <CardDescription>Occupied beds cannot be deleted during capacity changes.</CardDescription>
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
                      <p className="font-medium">Room {room.number}</p>
                      <p className="text-xs text-muted-foreground">
                        {room.beds.length} sharing · {occupied} occupied
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

function Summary({ icon: Icon, value, label }: { icon: typeof Building2; value: number; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex size-9 items-center justify-center rounded-lg bg-muted"><Icon className="size-4" /></div>
      <div><p className="text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
    </div>
  );
}

