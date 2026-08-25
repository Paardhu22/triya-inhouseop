"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { IndianRupee, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setRoomRent } from "@/lib/actions/rooms";
import { paiseToRupees } from "@/lib/money";

export type RoomRentTarget = {
  id: string;
  number: string;
  defaultRent: number | null;
  defaultMaintenance: number | null;
  /** Active tenancies in the room — how many people "apply to occupants" would touch. */
  occupantCount: number;
};

const toInput = (paise: number | null) => (paise === null ? "" : String(paiseToRupees(paise)));
/** Blank clears the room default; anything else must be a valid non-negative number. */
const toAmount = (value: string): number | null | undefined => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Set rent for a whole room rather than one tenant at a time. The amounts become the
 * room's defaults (they pre-fill a new move-in) and can optionally be pushed onto
 * everyone currently in the room.
 */
export function RoomRentDialog({
  room,
  trigger,
  isFlat = false,
}: {
  room: RoomRentTarget;
  trigger?: ReactNode;
  /** Self-contained flats read "Flat 301", not "Room 301". */
  isFlat?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rent, setRent] = useState(() => toInput(room.defaultRent));
  const [maintenance, setMaintenance] = useState(() => toInput(room.defaultMaintenance));
  const [applyToOccupants, setApplyToOccupants] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const noun = isFlat ? "Flat" : "Room";

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setRent(toInput(room.defaultRent));
      setMaintenance(toInput(room.defaultMaintenance));
      setApplyToOccupants(false);
      setError(null);
    }
  }

  function save() {
    const rentValue = toAmount(rent);
    const maintenanceValue = toAmount(maintenance);
    if (rentValue === undefined || maintenanceValue === undefined) {
      setError("Enter a valid amount, or leave it blank to clear the default");
      return;
    }
    if (applyToOccupants && rentValue === null) {
      setError("Enter a rent amount before applying it to the current occupants");
      return;
    }

    start(async () => {
      const res = await setRoomRent({
        roomId: room.id,
        rent: rentValue,
        maintenance: maintenanceValue,
        applyToOccupants,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(
        res.data.updatedTenancies > 0
          ? `${noun} ${room.number} rent saved and applied to ${res.data.updatedTenancies} tenant${
              res.data.updatedTenancies === 1 ? "" : "s"
            }`
          : `${noun} ${room.number} rent saved`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <IndianRupee className="size-3.5" />
            Set Rent
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {noun} {room.number} rent
          </DialogTitle>
          <DialogDescription>
            Sets the rent for the whole {noun.toLowerCase()}. New move-ins start from these
            amounts; existing tenants keep their own rent unless you apply it below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Rent (₹/month)</Label>
              <Input
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="e.g. 9000"
                value={rent}
                onChange={(e) => {
                  setRent(e.target.value);
                  setError(null);
                }}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Maintenance (₹/month)</Label>
              <Input
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="0"
                value={maintenance}
                onChange={(e) => {
                  setMaintenance(e.target.value);
                  setError(null);
                }}
                disabled={pending}
              />
            </div>
          </div>

          <label
            className={
              room.occupantCount === 0
                ? "flex cursor-not-allowed items-start gap-2.5 rounded-lg border border-border p-3 opacity-50"
                : "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3"
            }
          >
            <Checkbox
              checked={applyToOccupants}
              disabled={pending || room.occupantCount === 0}
              onCheckedChange={(value) => {
                setApplyToOccupants(value === true);
                setError(null);
              }}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">Apply to current occupants</span>
              <span className="block text-xs text-muted-foreground">
                {room.occupantCount === 0
                  ? `No one is currently in this ${noun.toLowerCase()}.`
                  : `Overwrites the rent of ${room.occupantCount} active tenant${
                      room.occupantCount === 1 ? "" : "s"
                    } from the next view of their dues.`}
              </span>
            </span>
          </label>

          <p className="text-xs text-muted-foreground">
            Leave a field blank to clear the {noun.toLowerCase()} default.
          </p>

          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save rent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
