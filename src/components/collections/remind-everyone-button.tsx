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
import { remindAllTenants } from "@/lib/actions/collections";

export function RemindEveryoneButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function onConfirm() {
    start(async () => {
      const res = await remindAllTenants();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      const { sent, failed, skipped } = res.data;
      const undelivered = failed + skipped;
      if (sent === 0) {
        toast.error("No rent reminders could be sent.");
      } else if (undelivered > 0) {
        toast.success(`Rent reminders sent to ${sent} tenant${sent === 1 ? "" : "s"}.`, {
          description: `${undelivered} could not be sent (no phone number or delivery failed).`,
        });
      } else {
        toast.success("Rent reminders sent successfully.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button>
          <BellRing className="size-4" />
          Remind Everyone
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send Rent Reminder</AlertDialogTitle>
          <AlertDialogDescription>
            This will send a rent reminder to every active tenant in the selected property.
            Do you want to continue?
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
