"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateRoomCapacity } from "@/lib/actions/admin";
import type { AdminPropertyConfig } from "@/lib/queries/admin";
import { cn } from "@/lib/utils";

type Room = AdminPropertyConfig["floors"][number]["rooms"][number];

export function RoomCapacityDialog({ room }: { room: Room }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState(room.beds.length);
  const [selectedBedIds, setSelectedBedIds] = useState<string[]>([]);

  const occupied = room.beds.filter((bed) => bed.status === "OCCUPIED");
  const available = room.beds.filter((bed) => bed.status === "AVAILABLE");
  const removalCount = Math.max(0, room.beds.length - target);
  const canSubmit = removalCount === selectedBedIds.length && target >= occupied.length;

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setTarget(room.beds.length);
      setSelectedBedIds([]);
    }
  }

  function changeTarget(value: string) {
    setTarget(Number(value));
    setSelectedBedIds([]);
  }

  function toggleBed(id: string, checked: boolean | "indeterminate") {
    setSelectedBedIds((current) =>
      checked === true ? [...current, id] : current.filter((bedId) => bedId !== id),
    );
  }

  function save() {
    startTransition(async () => {
      const result = await updateRoomCapacity({
        roomId: room.id,
        targetSharing: target,
        removeBedIds: selectedBedIds,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Room ${room.number} capacity updated`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="size-3.5" />
          Configure
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Room {room.number} capacity</DialogTitle>
          <DialogDescription>
            Increase capacity by creating beds, or choose the available beds to remove.
            Occupied beds are always protected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-center">
            <div>
              <p className="text-lg font-semibold">{room.beds.length}</p>
              <p className="text-xs text-muted-foreground">Current</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-occupied">{occupied.length}</p>
              <p className="text-xs text-muted-foreground">Occupied</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-available">{available.length}</p>
              <p className="text-xs text-muted-foreground">Available</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>New sharing capacity</Label>
            <Select value={String(target)} onValueChange={changeTarget} disabled={pending}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                  <SelectItem key={count} value={String(count)} disabled={count < occupied.length}>
                    {count} sharing
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {removalCount > 0 ? (
            <div className="space-y-2">
              <div>
                <Label>Select {removalCount} available bed{removalCount === 1 ? "" : "s"}</Label>
                <p className="text-xs text-muted-foreground">The selected bed records will be removed.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {room.beds.map((bed) => {
                  const disabled = bed.status === "OCCUPIED";
                  const checked = selectedBedIds.includes(bed.id);
                  return (
                    <label
                      key={bed.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border p-3 text-sm",
                        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                        checked && "border-primary bg-primary/5",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled || (!checked && selectedBedIds.length >= removalCount)}
                        onCheckedChange={(value) => toggleBed(bed.id, value)}
                      />
                      <BedDouble className="size-4 text-muted-foreground" />
                      Bed {bed.label}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {disabled ? "Occupied" : "Available"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : target > room.beds.length ? (
            <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              {target - room.beds.length} new bed{target - room.beds.length === 1 ? "" : "s"} will be created automatically.
            </p>
          ) : null}
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={save} disabled={pending || !canSubmit || target === room.beds.length}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save capacity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

