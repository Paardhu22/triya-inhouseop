import { cn } from "@/lib/utils";

type Meta = { label: string; dot: string };

export function StatusBadge({
  meta,
  className,
}: {
  meta: Meta;
  /** Retained for call-site compatibility; the dot is always shown now. */
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap text-foreground",
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
