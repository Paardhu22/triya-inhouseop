import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** Accepted for call-site compatibility; intentionally not rendered. */
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md", className)}>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mt-3 text-3xl font-bold leading-none tracking-tight tabular-nums text-foreground sm:text-4xl">
        {value}
      </div>
      {hint ? (
        <div className="mt-2 text-xs text-muted-foreground/80">{hint}</div>
      ) : null}
    </div>
  );
}
