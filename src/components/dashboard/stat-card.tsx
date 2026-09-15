import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  variant = "grid",
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  variant?: "grid" | "standalone";
  /** Accepted for call-site compatibility; intentionally not rendered. */
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "p-5 sm:p-6 bg-card transition-colors flex flex-col justify-between",
        variant === "standalone"
          ? "rounded-lg border border-border"
          : "hover:bg-muted/20",
        className
      )}
    >
      <div className="text-[0.7rem] font-bold tracking-[0.1em] text-muted-foreground uppercase font-mono">
        {label}
      </div>
      <div
        className="mt-3 truncate text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground sm:text-[2rem]"
        title={String(value)}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-2.5 text-xs text-muted-foreground/80 leading-relaxed font-normal">{hint}</div>
      ) : null}
    </div>
  );
}
