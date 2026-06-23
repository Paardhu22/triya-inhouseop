"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="size-5" /></div>
        <h2 className="mt-4 text-lg font-semibold">This page could not be loaded</h2>
        <p className="mt-1 text-sm text-muted-foreground">The request failed unexpectedly. Retry before leaving the page.</p>
        <Button className="mt-4" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}

