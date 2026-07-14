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
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Available
      </span>
    );
  }
  if (tenancy.paymentStatus === "PAID") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
        Paid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-800 dark:bg-rose-950/60 dark:text-rose-400">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 py-4">
          {room?.beds.map((bed) => {
            const tenancy = bed.tenancies[0];
            const isOccupied = bed.status === "OCCUPIED" && tenancy;

            return (
              <button
                key={bed.id}
                onClick={() => onSelectBed(bed.id)}
                className="group flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <div className="font-semibold tracking-tight text-foreground">
                    Bed {bed.label}
                  </div>
                  <StatusChip bed={bed} />
                </div>
                
                {isOccupied ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <User className="size-3.5 text-muted-foreground" />
                      <span className="truncate">{tenancy.tenant.fullName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(tenancy.monthlyRent)}/mo
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
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
