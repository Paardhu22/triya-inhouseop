"use client";

import { useRef } from "react";
import { Banknote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CollectRentDialog, type CollectRentHandle } from "./collect-rent-dialog";

/** A standalone "Collect Rent" button (e.g. on the tenant profile) for one tenancy. */
export function CollectRentButton({
  tenancyId,
  canDelete,
}: {
  tenancyId: string;
  /** ADMIN/MANAGER may remove a wrongly entered collection. */
  canDelete: boolean;
}) {
  const ref = useRef<CollectRentHandle>(null);
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => ref.current?.open()}>
        <Banknote className="size-4" />
        Collect Rent
      </Button>
      <CollectRentDialog ref={ref} tenancyId={tenancyId} canDelete={canDelete} />
    </>
  );
}
