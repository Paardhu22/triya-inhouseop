"use client";

import { useTransition } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { sendRentReminder } from "@/lib/actions/collections";

export function RentReminderButton({ tenancyId }: { tenancyId: string }) {
  const [pending, start] = useTransition();

  function onClick() {
    start(async () => {
      const res = await sendRentReminder(tenancyId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Rent reminder sent");
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
      Rent Reminder
    </Button>
  );
}
