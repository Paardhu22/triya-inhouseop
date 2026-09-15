"use client";

import { useState, useTransition } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { remindPendingTenants } from "@/lib/actions/collections";

/**
 * Remind ONLY the tenants who still owe rent (unpaid or part-paid this month, or an
 * unpaid earlier month). Separate from "Remind Everyone", which messages every tenant.
 */
export function RemindPendingButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function onConfirm() {
    start(async () => {
      const res = await remindPendingTenants();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      const { sent, failed, skipped, eligible } = res.data;
      const undelivered = failed + skipped;
      if (eligible === 0) {
        toast.success("Nobody has rent pending — no reminders were needed.");
      } else if (sent === 0) {
        toast.error("No rent reminders could be sent.");
      } else if (undelivered > 0) {
        toast.success(`Reminders sent to ${sent} tenant${sent === 1 ? "" : "s"} with rent pending.`, {
          description: `${undelivered} could not be sent (no phone number or delivery failed).`,
        });
      } else {
        toast.success(`Reminders sent to ${sent} tenant${sent === 1 ? "" : "s"} with rent pending.`);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button disabled={count === 0}>
          <BellRing className="size-4" />
          Remind Pending
          <span className="tabular-nums opacity-70">{count}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remind tenants with rent pending</AlertDialogTitle>
          <AlertDialogDescription>
            This will send a reminder to the {count} tenant{count === 1 ? "" : "s"} who have not
            paid in full — unpaid or partially paid this month, or with an unpaid earlier month.
            Each message states that tenant&apos;s own balance. Fully paid tenants are not
            messaged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Send Reminders
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
