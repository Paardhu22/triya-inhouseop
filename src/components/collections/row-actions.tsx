"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Banknote, Loader2, MoreHorizontal, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sendRentReminder } from "@/lib/actions/collections";
import { CollectRentDialog, type CollectRentHandle } from "./collect-rent-dialog";
import { InvoicePreviewDialog, type InvoicePreviewHandle } from "./invoice-preview-dialog";

/**
 * The single "Actions" menu on a Collections row: Collect Rent, Send Invoice and
 * Rent Reminder. Recording a collection issues and sends its invoice automatically, so
 * "Send Invoice" here is for a bill sent BEFORE payment.
 *
 * The dialogs are siblings of the menu, not children of its items — a dialog rendered
 * inside a `DropdownMenuItem` is unmounted the moment the menu closes.
 */
export function CollectionsRowActions({
  tenancyId,
  month,
  canRemind,
  canDelete,
}: {
  tenancyId: string;
  /** Billing month the row describes (YYYY-MM); the dialogs open on it. */
  month: string;
  /** Something is outstanding, so a reminder makes sense. */
  canRemind: boolean;
  /** ADMIN/MANAGER may remove a wrongly entered collection. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [reminding, startReminder] = useTransition();
  const collectRef = useRef<CollectRentHandle>(null);
  const invoiceRef = useRef<InvoicePreviewHandle>(null);

  // Radix restores focus to the trigger while the menu closes; opening a modal in the
  // same tick fights that. Deferring a frame lets the menu finish closing first.
  function afterMenuCloses(fn: () => void) {
    setTimeout(fn, 0);
  }

  function onRemind() {
    startReminder(async () => {
      const res = await sendRentReminder(tenancyId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Rent reminder sent");
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Actions" disabled={reminding}>
            {reminding ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => afterMenuCloses(() => collectRef.current?.open())}>
            <Banknote className="size-4" />
            Collect Rent
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => afterMenuCloses(() => invoiceRef.current?.open())}>
            <Send className="size-4" />
            Send Invoice
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!canRemind || reminding} onSelect={onRemind}>
            <BellRing className="size-4" />
            Rent Reminder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CollectRentDialog
        ref={collectRef}
        tenancyId={tenancyId}
        canDelete={canDelete}
        defaultMonth={month}
      />

      <InvoicePreviewDialog
        ref={invoiceRef}
        tenancyId={tenancyId}
        month={month}
        onOpenChange={(next) => {
          if (!next) router.refresh();
        }}
      />
    </>
  );
}
