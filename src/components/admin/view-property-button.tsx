"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { selectProperty } from "@/lib/actions/property";

/** Lets the App Owner browse into a property with the same operational view a Manager gets. */
export function ViewPropertyButton({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function view() {
    startTransition(async () => {
      const res = await selectProperty(propertyId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push("/dashboard");
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={view}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
      View property
    </Button>
  );
}
