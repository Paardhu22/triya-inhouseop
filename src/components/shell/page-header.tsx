import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-2">
        <h1 className="text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.045em] text-foreground sm:text-[2rem]">
          {title}
          <span aria-hidden="true" className="text-primary">.</span>
        </h1>
        {description ? (
          <p className="max-w-[60ch] text-sm leading-[1.8] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
