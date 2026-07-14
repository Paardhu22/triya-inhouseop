"use client";

import { User } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FloorRoom } from "@/lib/queries/floor";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function StatusChip({ bed }: { bed: FloorRoom["beds"][number] }) {
  const tenancy = bed.tenancies[0];
  if (!tenancy || bed.status !== "OCCUPIED") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Available
      </span>
    );
  }
  if (tenancy.paymentStatus === "PAID") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-500">
        Paid
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-500">
      Pending
    </span>
  );
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl bg-background border-border shadow-lg">
        <DialogHeader>
          <DialogTitle>Room {room?.number}</DialogTitle>
          <DialogDescription>
            Select a bed to view or manage tenant details.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap justify-center gap-4 py-4">
          {room?.beds.map((bed) => {
            const tenancy = bed.tenancies[0];
            const isOccupied = bed.status === "OCCUPIED" && tenancy;

            return (
              <button
                key={bed.id}
                onClick={() => onSelectBed(bed.id)}
                className="group relative flex w-full max-w-[200px] flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 pt-5 text-left transition-all hover:border-primary/30 hover:shadow-md focus:outline-none overflow-hidden"
              >
                {/* Subtle Bed Design Elements: Pillow and Blanket line */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-muted/30" />
                <div className="absolute top-2 left-1/2 h-2.5 w-12 -translate-x-1/2 rounded-full border border-black/5 dark:border-white/5 bg-muted/20" />
                
                <div className="mt-1 flex w-full items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold tracking-tight text-foreground">
                    Bed {bed.label}
                  </div>
                  <StatusChip bed={bed} />
                </div>
                
                {isOccupied ? (
                  <div className="flex flex-col gap-1 z-10">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <User className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{tenancy.tenant.fullName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(tenancy.monthlyRent / 100)}/mo
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 z-10">
                    <div className="text-sm font-medium text-muted-foreground">
                      No tenant
                    </div>
                    <div className="text-xs text-muted-foreground/60">
                      Empty bed
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
