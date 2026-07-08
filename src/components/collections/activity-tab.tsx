import { format } from "date-fns";
import { MessageCircle, Phone } from "lucide-react";

import { StatusBadge } from "@/components/common/status-badge";
import type { RecentCall, RecentMessage } from "@/lib/queries/activity";
import { CALL_STATUS_META, MESSAGE_STATUS_META } from "@/lib/status";

function Empty({ icon: Icon, label }: { icon: typeof MessageCircle; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-16 text-center">
      <Icon className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function ActivityTab({ messages, calls }: { messages: RecentMessage[]; calls: RecentCall[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          <MessageCircle className="size-3.5" />
          Message status
        </h2>
        {messages.length === 0 ? (
          <Empty icon={MessageCircle} label="No reminder messages sent yet." />
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border border-border bg-card">
            {messages.map((m) => (
              <div key={m.id} className="space-y-1 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{m.tenant.fullName}</p>
                  <StatusBadge meta={MESSAGE_STATUS_META[m.status]} />
                </div>
                <p className="truncate text-xs text-muted-foreground" title={m.body}>
                  {m.body}
                </p>
                <p className="text-[11px] text-muted-foreground/70">
                  {format(new Date(m.createdAt), "dd MMM yyyy, HH:mm")}
                  {m.status === "FAILED" && m.error ? ` · ${m.error}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          <Phone className="size-3.5" />
          Call status
        </h2>
        {calls.length === 0 ? (
          <Empty icon={Phone} label="No AI calls placed yet." />
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border border-border bg-card">
            {calls.map((c) => (
              <div key={c.id} className="space-y-1 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{c.tenant.fullName}</p>
                  <StatusBadge meta={CALL_STATUS_META[c.status]} />
                </div>
                <p className="text-[11px] text-muted-foreground/70">
                  {format(new Date(c.createdAt), "dd MMM yyyy, HH:mm")}
                  {c.status === "FAILED" && c.error ? ` · ${c.error}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
