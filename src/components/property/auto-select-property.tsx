"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { selectProperty } from "@/lib/actions/property";

/**
 * A property manager only ever has one property, so there is nothing to choose —
 * select it automatically and move straight to the dashboard instead of showing a
 * one-item picker.
 */
export function AutoSelectProperty({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const res = await selectProperty(propertyId);
      router.replace(res.ok ? "/dashboard" : "/login");
    })();
  }, [propertyId, router]);

  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/60">
      <Loader2 className="size-4 animate-spin" />
      Preparing your property…
    </div>
  );
}
