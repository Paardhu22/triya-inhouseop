import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm"><p className="text-sm font-medium text-muted-foreground">404</p><h1 className="mt-2 text-2xl font-semibold">Page not found</h1><p className="mt-2 text-sm text-muted-foreground">The page or record may have moved, or it may not exist in the selected property.</p><Button asChild className="mt-5"><Link href="/dashboard">Back to dashboard</Link></Button></div></main>;
}

