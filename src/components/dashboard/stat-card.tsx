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
          ? "border border-border"
          : "hover:bg-muted/15",
        className
      )}
    >
      <div className="text-[0.725rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className="mt-3 truncate text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground sm:text-[1.85rem]"
        title={String(value)}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-2 text-xs text-muted-foreground leading-relaxed font-normal">{hint}</div>
      ) : null}
    </div>
  );
}
