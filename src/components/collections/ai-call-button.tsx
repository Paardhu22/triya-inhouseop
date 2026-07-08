"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CallState =
  | { kind: "idle" }
  | { kind: "calling" }
  | { kind: "connected" }
  | { kind: "completed" }
  | { kind: "failed"; error: string };

const STATUS_LABEL: Record<Exclude<CallState["kind"], "idle">, string> = {
  calling: "Calling...",
  connected: "Connected",
  completed: "Completed",
  failed: "Failed",
};

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90_000;
const RESET_DELAY_MS = 4000;

export function AiCallButton({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<CallState>({ kind: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    [],
  );

  function finish(next: CallState) {
    if (pollRef.current) clearInterval(pollRef.current);
    setState(next);
    resetRef.current = setTimeout(() => setState({ kind: "idle" }), RESET_DELAY_MS);
  }

  function pollStatus(callId: string) {
    const startedAt = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        finish({ kind: "failed", error: "Timed out waiting for call status" });
        toast.error("AI call timed out");
        return;
      }
      try {
        const res = await fetch(`/api/calls/${callId}`);
        const data = await res.json();
        if (!res.ok) {
          finish({ kind: "failed", error: data.error ?? "Failed to fetch call status" });
          toast.error(data.error ?? "Failed to fetch call status");
          return;
        }
        if (data.status === "CONNECTED") setState({ kind: "connected" });
        else if (data.status === "COMPLETED") {
          finish({ kind: "completed" });
          toast.success("AI call completed");
        } else if (data.status === "FAILED") {
          finish({ kind: "failed", error: data.error ?? "Call failed" });
          toast.error(data.error ?? "Call failed");
        }
        // else CALLING — keep polling
      } catch {
        // transient poll error — keep trying until POLL_TIMEOUT_MS
      }
    }, POLL_INTERVAL_MS);
  }

  async function startCall() {
    setState({ kind: "calling" });
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const data = await res.json();
      if (!res.ok) {
        finish({ kind: "failed", error: data.error ?? "Failed to place the call" });
        toast.error(data.error ?? "Failed to place the call");
        return;
      }
      pollStatus(data.callId);
    } catch (e) {
      finish({ kind: "failed", error: e instanceof Error ? e.message : "Failed to place the call" });
      toast.error("Failed to place the call");
    }
  }

  const inProgress = state.kind === "calling" || state.kind === "connected";

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={startCall} disabled={inProgress}>
        {inProgress && <Loader2 className="size-4 animate-spin" />}
        📞 AI Call
      </Button>
      {state.kind !== "idle" && (
        <span
          className={cn(
            "max-w-40 truncate text-xs",
            state.kind === "failed" ? "text-destructive" : "text-muted-foreground",
          )}
          title={state.kind === "failed" ? state.error : undefined}
        >
          {STATUS_LABEL[state.kind]}
          {state.kind === "failed" ? `: ${state.error}` : ""}
        </span>
      )}
    </div>
  );
}
