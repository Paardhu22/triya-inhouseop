"use client";

import { useTransition } from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { togglePaymentStatus } from "@/lib/actions/tenants";

export function TogglePaymentStatusButton({
  tenancyId,
  currentStatus,
}: {
  tenancyId: string;
  currentStatus: "PAID" | "PENDING" | "OVERDUE";
}) {
  const [isPending, startTransition] = useTransition();

  const isPaid = currentStatus === "PAID";
  const newStatus = isPaid ? "PENDING" : "PAID";

  const handleToggle = () => {
    startTransition(async () => {
      const result = await togglePaymentStatus(tenancyId, newStatus);
      if (result.ok) {
        toast.success(`Payment status marked as ${newStatus.toLowerCase()}`);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={handleToggle}
      disabled={isPending}
    >
      {isPaid ? (
        <>
          <CircleDashed className="size-4 text-muted-foreground" />
          Mark Unpaid
        </>
      ) : (
        <>
          <CheckCircle2 className="size-4 text-emerald-500" />
          Mark Paid
        </>
      )}
    </Button>
  );
}
