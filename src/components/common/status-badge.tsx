import { cn } from "@/lib/utils";

type Meta = { label: string; badge: string; dot: string };

export function StatusBadge({
  meta,
  dot = false,
  className,
}: {
  meta: Meta;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        meta.badge,
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", meta.dot)} /> : null}
      {meta.label}
    </span>
  );
}
