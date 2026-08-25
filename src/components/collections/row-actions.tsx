"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Banknote, Loader2, MoreHorizontal, Send } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
 * Rent Reminder, replacing the row of standalone buttons.
 *
 * The dialogs are siblings of the menu, not children of its items — a dialog rendered
 * inside a `DropdownMenuItem` is unmounted the moment the menu closes.
 */
export function CollectionsRowActions({
  tenancyId,
  isPaid,
  canDelete,
}: {
  tenancyId: string;
  /** Current cycle already settled — nothing to chase. */
  isPaid: boolean;
  /** ADMIN/MANAGER may remove a wrongly entered collection. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [invoicePromptOpen, setInvoicePromptOpen] = useState(false);
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
          <Button variant="outline" size="sm" disabled={reminding}>
            {reminding ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
            Actions
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
          <DropdownMenuItem disabled={isPaid || reminding} onSelect={onRemind}>
            <BellRing className="size-4" />
            Rent Reminder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CollectRentDialog
        ref={collectRef}
        tenancyId={tenancyId}
        canDelete={canDelete}
        // Only offer the invoice once the month is actually settled — an invoice for a
        // part payment would misstate what the tenant owes.
        onCollected={({ fullyPaid }) => {
          if (fullyPaid) afterMenuCloses(() => setInvoicePromptOpen(true));
        }}
      />

      <AlertDialog
        open={invoicePromptOpen}
        onOpenChange={(next) => {
          setInvoicePromptOpen(next);
          if (!next) router.refresh();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rent collected</AlertDialogTitle>
            <AlertDialogDescription>
              This month is now fully paid. Would you like to send the invoice?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Later</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                // Close manually so onOpenChange does not fire an early refresh that
                // would unmount this row mid-flow.
                setInvoicePromptOpen(false);
                afterMenuCloses(() => invoiceRef.current?.open());
              }}
            >
              Send Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InvoicePreviewDialog
        ref={invoiceRef}
        tenancyId={tenancyId}
        onOpenChange={(next) => {
          if (!next) router.refresh();
        }}
      />
    </>
  );
}
