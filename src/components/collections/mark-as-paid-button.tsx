"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { markRentPaid } from "@/lib/actions/collections";
import { formatINR } from "@/lib/money";
import { InvoicePreviewDialog, type InvoicePreviewHandle } from "./invoice-preview-dialog";

/**
 * Records a pending tenancy's rent as received without leaving the Collections page:
 * confirm → mark paid → offer to send the invoice straight away. The row refresh is
 * deferred until this whole flow ends, otherwise the parent would drop this row from
 * the "unpaid" set and unmount the follow-up dialogs mid-flow.
 */
export function MarkAsPaidButton({
  tenancyId,
  tenantName,
  amountPaise,
}: {
  tenancyId: string;
  tenantName: string;
  amountPaise: number;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [pending, start] = useTransition();
  const invoiceRef = useRef<InvoicePreviewHandle>(null);

  function onConfirm() {
    start(async () => {
      const res = await markRentPaid(tenancyId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Payment marked as completed.");
      setConfirmOpen(false);
      setPromptOpen(true);
    });
  }

  function onInvoiceOpenChange(next: boolean) {
    // Invoice flow finished (sent or dismissed) — now reflect the new PAID state.
    if (!next) router.refresh();
  }

  return (
    <>
      <AlertDialog open={confirmOpen} onOpenChange={(next) => !pending && setConfirmOpen(next)}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-36 justify-start">
            <CheckCircle2 className="size-4" />
            Mark as Paid
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Has the rent payment of <strong>{formatINR(amountPaise)}</strong> been received from{" "}
              <strong>{tenantName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Follow-up: invoices are only sent after payment is confirmed. */}
      <AlertDialog
        open={promptOpen}
        onOpenChange={(next) => {
          setPromptOpen(next);
          // Closed via Later/Escape/overlay (not the "Send Invoice" path, which closes
          // the prompt manually without firing this) — reflect the new PAID state now.
          if (!next) router.refresh();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Payment recorded</AlertDialogTitle>
            <AlertDialogDescription>
              Payment recorded successfully. Would you like to send the invoice now?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Later</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                // Close the prompt manually (won't fire onOpenChange → no early refresh)
                // and hand off to the invoice dialog.
                setPromptOpen(false);
                invoiceRef.current?.open();
              }}
            >
              Send Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InvoicePreviewDialog ref={invoiceRef} tenancyId={tenancyId} onOpenChange={onInvoiceOpenChange} />
    </>
  );
}
