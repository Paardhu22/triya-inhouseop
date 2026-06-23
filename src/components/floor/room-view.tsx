"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FloorRoom } from "@/lib/queries/floor";
import { cn } from "@/lib/utils";

function bedState(bed: FloorRoom["beds"][number]) {
  const tenancy = bed.tenancies[0];
  if (!tenancy || bed.status !== "OCCUPIED") {
    return { label: "Empty", cardClass: "bg-green-100" };
  }
  if (tenancy.paymentStatus === "PAID") {
    return { label: "Paid", cardClass: "bg-pink-100" };
  }
  return { label: "Not Paid", cardClass: "bg-pink-100" };
}

export function RoomView({
  room,
  onOpenChange,
  onSelectBed,
}: {
  room: FloorRoom | null;
  onOpenChange: (open: boolean) => void;
  onSelectBed: (bedId: string) => void;
}) {
  return (
    <Dialog open={Boolean(room)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Room {room?.number}</DialogTitle>
          <DialogDescription className="sr-only">
            Beds in this room. Click a bed to manage it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-5 py-2 sm:grid-cols-3">
          {room?.beds.map((bed) => {
            const state = bedState(bed);
            return (
              <button
                key={bed.id}
                onClick={() => onSelectBed(bed.id)}
                className={cn(
                  "flex min-h-[200px] flex-col items-center justify-between rounded-3xl p-5 transition hover:brightness-95",
                  state.cardClass,
                )}
              >
                <span className="rounded-xl bg-white px-4 py-2 text-sm font-medium shadow-sm">
                  {state.label}
                </span>
                <span className="text-lg font-semibold">Bed {bed.label}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
