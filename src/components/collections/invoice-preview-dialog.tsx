"use client";

import {
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
  type Ref,
} from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { prepareInvoice, sendInvoice } from "@/lib/actions/collections";
import { computeInvoiceTotals, type InvoiceView } from "@/lib/invoice-compute";
import { InvoiceDocument } from "./invoice-document";

type Fields = {
  billingMonth: string; // YYYY-MM
  dueDate: string; // YYYY-MM-DD or ""
  previousDue: string; // rupees
  extraChargesLabel: string;
  extraCharges: string; // rupees
  discount: string; // rupees
  notes: string;
};

const toPaise = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

/** Imperative handle so a parent can open the dialog (and load its data) on demand. */
export type InvoicePreviewHandle = { open: () => void };

export function InvoicePreviewDialog({
  tenancyId,
  trigger,
  onOpenChange,
  ref,
}: {
  tenancyId: string;
  /** Optional — omit when the dialog is driven externally via the imperative `ref`. */
  trigger?: ReactNode;
  /** Notified whenever the dialog opens or closes. */
  onOpenChange?: (open: boolean) => void;
  ref?: Ref<InvoicePreviewHandle>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [base, setBase] = useState<InvoiceView | null>(null);
  const [fields, setFields] = useState<Fields>(blankFields);
  const [sending, startSending] = useTransition();

  const change = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  // Open the dialog and load fresh defaults. Called both from the trigger and via the
  // imperative handle (e.g. straight after marking a payment received), so the numbers
  // are always freshly computed server-side.
  const openAndLoad = useCallback(() => {
    change(true);
    setBase(null);
    setFields(blankFields());
    setLoading(true);
    prepareInvoice(tenancyId).then((res) => {
      setLoading(false);
      if (!res.ok) {
        toast.error(res.error);
        change(false);
        return;
      }
      setBase(res.data);
      setFields({
        billingMonth: res.data.billingMonth.slice(0, 7),
        dueDate: res.data.dueDate ?? "",
        previousDue: "",
        extraChargesLabel: "",
        extraCharges: "",
        discount: "",
        notes: "",
      });
    });
  }, [tenancyId, change]);

  useImperativeHandle(ref, () => ({ open: openAndLoad }), [openAndLoad]);

  function onDialogOpenChange(next: boolean) {
    if (next) openAndLoad();
    else change(false);
  }

  // Live preview: merge edits onto the prepared base and recompute totals so the
  // rendered document is exactly what will be converted to PDF and sent.
  const preview = useMemo<InvoiceView | null>(() => {
    if (!base) return null;
    const previousDuePaise = toPaise(fields.previousDue);
    const extraChargesPaise = toPaise(fields.extraCharges);
    const discountPaise = toPaise(fields.discount);
    const { subtotalPaise, totalPaise } = computeInvoiceTotals({
      rentPaise: base.rentPaise,
      maintenancePaise: base.maintenancePaise,
      previousDuePaise,
      extraChargesPaise,
      discountPaise,
    });
    return {
      ...base,
      billingMonth: fields.billingMonth ? `${fields.billingMonth}-01` : base.billingMonth,
      dueDate: fields.dueDate || null,
      previousDuePaise,
      extraChargesPaise,
      extraChargesLabel: fields.extraChargesLabel.trim() || null,
      discountPaise,
      notes: fields.notes.trim() || null,
      subtotalPaise,
      totalPaise,
    };
  }, [base, fields]);

  function onSend() {
    startSending(async () => {
      const res = await sendInvoice({ tenancyId, ...fields });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Invoice sent on WhatsApp");
      change(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onDialogOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        showCloseButton={false}
        className="flex h-[90vh] w-[90vw] max-w-[1500px] flex-col gap-0 overflow-y-auto p-0 sm:max-w-[1500px] lg:flex-row lg:overflow-hidden"
      >
        {/* LEFT — editable fields (own scroll, sticky header + footer) */}
        <div className="flex flex-col border-b lg:h-full lg:w-[36%] lg:min-w-[360px] lg:max-w-[480px] lg:shrink-0 lg:overflow-hidden lg:border-b-0 lg:border-r">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b px-6 py-4">
            <div className="space-y-1">
              <DialogTitle>Invoice preview</DialogTitle>
              <DialogDescription>
                Review the invoice and adjust the optional fields before sending.
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X className="size-4" />
              </Button>
            </DialogClose>
          </div>

          <div className="space-y-3 px-6 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {!preview ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <Field label="Billing month">
                  <Input
                    type="month"
                    value={fields.billingMonth}
                    onChange={(e) => set("billingMonth", e.target.value)}
                  />
                </Field>
                <Field label="Due date">
                  <Input
                    type="date"
                    value={fields.dueDate}
                    onChange={(e) => set("dueDate", e.target.value)}
                  />
                </Field>
                <Field label="Previous due (₹)">
                  <Input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    placeholder="0"
                    value={fields.previousDue}
                    onChange={(e) => set("previousDue", e.target.value)}
                  />
                </Field>
                <Field label="Extra charge label">
                  <Input
                    type="text"
                    placeholder="e.g. Electricity"
                    value={fields.extraChargesLabel}
                    onChange={(e) => set("extraChargesLabel", e.target.value)}
                  />
                </Field>
                <Field label="Extra charges (₹)">
                  <Input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    placeholder="0"
                    value={fields.extraCharges}
                    onChange={(e) => set("extraCharges", e.target.value)}
                  />
                </Field>
                <Field label="Discount (₹)">
                  <Input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    placeholder="0"
                    value={fields.discount}
                    onChange={(e) => set("discount", e.target.value)}
                  />
                </Field>
                <Field label="Notes">
                  <Textarea
                    rows={3}
                    placeholder="Optional note shown on the invoice"
                    value={fields.notes}
                    onChange={(e) => set("notes", e.target.value)}
                  />
                </Field>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/50 px-6 py-4">
            <Button variant="outline" onClick={() => change(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={onSend} disabled={sending || loading || !preview}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send Invoice
            </Button>
          </div>
        </div>

        {/* RIGHT — full A4 preview (own scroll, never cropped) */}
        <div className="flex-1 bg-muted/40 p-6 lg:min-h-0 lg:overflow-y-auto lg:p-8">
          {!preview ? (
            <div className="flex h-full min-h-60 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[794px]">
              <InvoiceDocument data={preview} className="lg:min-h-[1123px] lg:p-10" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function blankFields(): Fields {
  return {
    billingMonth: "",
    dueDate: "",
    previousDue: "",
    extraChargesLabel: "",
    extraCharges: "",
    discount: "",
    notes: "",
  };
}
