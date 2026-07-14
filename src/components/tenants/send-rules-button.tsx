"use client";

import { useTransition } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { sendPgRules } from "@/lib/actions/tenants";

export function SendRulesButton({ tenantId }: { tenantId: string }) {
  const [pending, start] = useTransition();

  function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    start(async () => {
      const res = await sendPgRules(tenantId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("PG rules sent");
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending} className="w-32 justify-start">
      {pending ? <Loader2 className="size-4 animate-spin" /> : <ScrollText className="size-4" />}
      Send Rules
    </Button>
  );
}
