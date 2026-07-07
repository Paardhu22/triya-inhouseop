"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { recordDepositCollected } from "@/lib/actions/tenants";

/** Marks the caution deposit as collected in cash — for online payments the tenant's
 * own Razorpay flow already does this; this is the manual/cash counterpart. */
export function RecordDepositButton({ tenancyId }: { tenancyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function record() {
    startTransition(async () => {
      const res = await recordDepositCollected(tenancyId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Deposit marked as collected");
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={record}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
      Mark deposit collected
    </Button>
  );
}
