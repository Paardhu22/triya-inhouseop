"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminPropertyConfig } from "@/lib/queries/admin";
import { PropertyStructureActions } from "./property-structure-actions";
import { RoomManagement } from "./room-management";

export function AdminClient({ config }: { config: AdminPropertyConfig }) {
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

      <Card variant="section">
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

      <RoomManagement config={config} />
    </div>
  );
}

function Summary({ value, label }: { value: number; label: string }) {
  return (
    <div className="border-t border-border pt-4">
      <p className="text-[2.125rem] font-bold tracking-[-0.03em] tabular-nums">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

