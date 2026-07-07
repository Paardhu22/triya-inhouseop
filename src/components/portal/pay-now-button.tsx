"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { initiateTenantPayment } from "@/lib/actions/payments";

export function PayNowButton() {
  const [pending, startTransition] = useTransition();

  function pay() {
    startTransition(async () => {
      const res = await initiateTenantPayment();
      if (!res.ok) {
        toast.info(res.error);
        return;
      }
      toast.success("Redirecting to payment...");
    });
  }

  return (
    <Button onClick={pay} disabled={pending} size="lg">
      Pay Now
    </Button>
  );
}
