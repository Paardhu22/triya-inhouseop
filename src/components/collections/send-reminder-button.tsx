"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { sendReminderMessage } from "@/lib/actions/collections";
import { cn } from "@/lib/utils";

type SendState = { kind: "idle" } | { kind: "sent" } | { kind: "failed"; error: string };

const RESET_DELAY_MS = 4000;

/** WhatsApp rent-reminder trigger — the first step of the Collections escalation
 * sequence (message, then AiCallButton if it goes unanswered). */
export function SendReminderButton({ tenancyId }: { tenancyId: string }) {
  const [state, setState] = useState<SendState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      const res = await sendReminderMessage(tenancyId);
      if (!res.ok) {
        setState({ kind: "failed", error: res.error });
        toast.error(res.error);
      } else {
        setState({ kind: "sent" });
        toast.success("Reminder sent");
      }
      setTimeout(() => setState({ kind: "idle" }), RESET_DELAY_MS);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={send} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
        Send Reminder
      </Button>
      {state.kind !== "idle" && (
        <span
          className={cn(
            "max-w-40 truncate text-xs",
            state.kind === "failed" ? "text-destructive" : "text-muted-foreground",
          )}
          title={state.kind === "failed" ? state.error : undefined}
        >
          {state.kind === "sent" ? "Sent" : `Failed: ${state.error}`}
        </span>
      )}
    </div>
  );
}
