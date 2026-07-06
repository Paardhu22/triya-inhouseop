"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

import { PropertyLogo } from "@/components/property/property-logo";
import { cn } from "@/lib/utils";
import { selectProperty } from "@/lib/actions/property";

type Item = { id: string; name: string; city: string | null; slug: string; logoKey?: string | null };

export function PropertyPicker({ properties }: { properties: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function choose(id: string) {
    setSelectedId(id);
    startTransition(async () => {
      const res = await selectProperty(id);
      if (!res.ok) {
        toast.error(res.error);
        setSelectedId(null);
        return;
      }
      router.push("/dashboard");
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {properties.map((p) => {
        const isLoading = pending && selectedId === p.id;
        return (
          <button
            key={p.id}
            onClick={() => choose(p.id)}
            disabled={pending}
            className={cn(
              "group flex items-center gap-4 rounded-xl border border-border bg-card p-6 text-left transition-colors duration-150 hover:bg-hover/50 disabled:opacity-60",
              selectedId === p.id && "border-primary",
            )}
          >
            <div className="flex size-11 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
              <PropertyLogo
                logoKey={p.logoKey}
                name={p.name}
                className="size-full object-contain p-1.5"
                iconClassName="size-5 text-primary"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{p.name}</p>
              {p.city ? (
                <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {p.city}
                </p>
              ) : null}
            </div>
            {isLoading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}
