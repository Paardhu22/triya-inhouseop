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
        "min-w-0 flex flex-col justify-start py-5",
        variant === "standalone"
          ? "border-t border-border"
          : "",
        className
      )}
    >
      <div className="text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div
        className="mt-3 truncate text-2xl font-semibold leading-none tracking-[-0.04em] tabular-nums text-foreground sm:text-[2rem]"
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
