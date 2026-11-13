"use client";

import {
  useCallback,
  useId,
  useRef,
  useImperativeHandle,
  useMemo,
  useState,
  useTransition,
  type Ref,
} from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Banknote, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  collectRent,
  deleteRentCollection,
  getRentCollection,
  type CollectRentResult,
} from "@/lib/actions/collections";
import { formatINR, paiseToRupees } from "@/lib/money";
import { PAYMENT_METHOD_META, type RentCollectionEntry, type RentCollectionView } from "@/lib/rent";
import { COLLECTION_STATE_META, PAYMENT_STATUS_META } from "@/lib/status";
import { collectRentSchema } from "@/lib/validations/collections";
import type { PaymentMethod } from "@/generated/prisma/client";

type Fields = {
  amount: string;
  method: PaymentMethod;
  cashAmount: string;
  onlineAmount: string;
  collectedAt: string;
  notes: string;
  sendInvoice: boolean;
};

/** `datetime-local` wants local wall-clock time, which toISOString() would shift. */
function toDatetimeLocal(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
const monthLabel = (key: string) => format(new Date(`${key}-01T00:00:00`), "MMM yyyy");
const thisMonth = () => format(new Date(), "yyyy-MM");

function blankFields(): Fields {
  return {
    amount: "",
    method: "CASH",
    cashAmount: "",
    onlineAmount: "",
    collectedAt: toDatetimeLocal(new Date()),
    notes: "",
    sendInvoice: true,
  };
}

function defaultFields(view: RentCollectionView): Fields {
  return {
    ...blankFields(),
    // Pre-fill with what is still owed — the overwhelmingly common case — but leave it
    // editable so a part payment can be recorded as it actually happened.
    amount: view.balancePaise > 0 ? String(paiseToRupees(view.balancePaise)) : "",
  };
}

/** Tell the staff what happened to the money AND to the invoice sent for it. */
function announce(result: CollectRentResult) {
  const headline = result.fullyPaid
    ? "Collection recorded. This month is fully paid."
    : `Collection recorded. ${formatINR(result.balancePaise)} still due.`;
  const invoice = result.invoice;
  if (!invoice) {
    toast.success(headline);
  } else if (invoice.delivered) {
    toast.success(headline, {
      description: `Invoice ${invoice.number} sent to the tenant on WhatsApp.`,
    });
  } else {
    toast.warning(headline, {
      description: invoice.number
        ? `Invoice ${invoice.number} was created but not sent: ${invoice.error ?? "delivery failed"}. Resend it from Invoice History.`
        : `The invoice could not be created: ${invoice.error ?? "unknown error"}.`,
      duration: 10_000,
    });
  }
}

/** Imperative handle so a parent can open the dialog (and load its data) on demand. */
export type CollectRentHandle = { open: () => void };

/**
 * Record a rent collection against one active tenancy: how much came in (a part
 * payment is fine — a month can take several), how it was split between cash and
 * online, and when it was handed over. Shows the month's collection history and any
 * unpaid earlier months, and by default issues + sends the invoice for the collection.
 */
export function CollectRentDialog({
  tenancyId,
  canDelete = false,
  defaultMonth,
  onCollected,
  ref,
}: {
  tenancyId: string;
  /** ADMIN/MANAGER may remove a wrongly entered collection. */
  canDelete?: boolean;
  /** Billing month (YYYY-MM) to open on; the current month when omitted. */
  defaultMonth?: string;
  /** Fired after a successful collection. */
  onCollected?: (result: CollectRentResult) => void;
  ref?: Ref<CollectRentHandle>;
}) {
  const router = useRouter();
  const formId = useId();
  const loadSequence = useRef(0);
  const amountRef = useRef<HTMLInputElement>(null);
  const removalTrigger = useRef<HTMLButtonElement>(null);
  const removalReviewOpen = useRef(false);
  const [removal, setRemoval] = useState<RentCollectionEntry | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => defaultMonth ?? thisMonth());
  const [view, setView] = useState<RentCollectionView | null>(null);
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState<Fields>(blankFields);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    setError(null);
  }

  const load = useCallback(
    (targetMonth: string, resetFields: boolean) => {
      const sequence = ++loadSequence.current;
      setLoading(true);
      setLoadError(null);
      void getRentCollection(tenancyId, targetMonth).then((res) => {
        if (sequence !== loadSequence.current) return;
        if (!res.ok) { setLoadError(res.error); return; }
        setView(res.data);
        if (resetFields) setFields(defaultFields(res.data));
      }).catch(() => {
        if (sequence === loadSequence.current) setLoadError("Could not load collections. Try again.");
      }).finally(() => {
        if (sequence === loadSequence.current) setLoading(false);
      });
    },
    [tenancyId],
  );

  // Open and load fresh figures in one step. Driven imperatively (same shape as
  // InvoicePreviewDialog) rather than by a controlled `open` prop: Radix does not fire
  // onOpenChange when a parent flips the prop, so a controlled dialog would never load.
  const openAndLoad = useCallback(() => {
    setOpen(true);
    const target = defaultMonth ?? thisMonth();
    setMonth(target);
    setView(null);
    setError(null);
    load(target, true);
  }, [load, defaultMonth]);

  useImperativeHandle(ref, () => ({ open: openAndLoad }), [openAndLoad]);

  function onDialogOpenChange(next: boolean) {
    if (next) openAndLoad();
    else if (!saving && !deleting && !removalReviewOpen.current) { loadSequence.current++; setOpen(false); setRemoval(null); }
  }

  function onMonthChange(next: string) {
    if (!next) return;
    setMonth(next);
    setView(null);
    setError(null);
    load(next, true);
  }

  // Live echo of what this entry will do to the month, so the balance shown after
  // saving is never a surprise.
  const preview = useMemo(() => {
    if (!view) return null;
    const entered = Math.round(num(fields.amount) * 100);
    const collected = view.collectedPaise + Math.max(0, entered);
    return {
      collected,
      balance: Math.max(0, view.duePaise - collected),
      advance: Math.max(0, collected - view.duePaise),
    };
  }, [view, fields.amount]);

  function onSubmit() {
    if (!view) return;
    const at = new Date(fields.collectedAt);
    if (Number.isNaN(at.getTime())) {
      setError("Select when the payment was collected");
      return;
    }
    const input = {
      tenancyId,
      forMonth: month,
      amount: num(fields.amount),
      method: fields.method,
      cashAmount: fields.method === "SPLIT" ? num(fields.cashAmount) : undefined,
      onlineAmount: fields.method === "SPLIT" ? num(fields.onlineAmount) : undefined,
      // Send an absolute instant so the server does not read it in its own timezone.
      collectedAt: at.toISOString(),
      notes: fields.notes.trim() || undefined,
      sendInvoice: fields.sendInvoice,
    };
    const parsed = collectRentSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the collection details");
      return;
    }

    startSaving(async () => {
      try {
      const res = await collectRent(parsed.data);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      announce(res.data);
      setOpen(false);
      router.refresh();
      onCollected?.(res.data);
      } catch {
        setOutcomeUnknown(true);
        setError("We could not confirm whether this collection was recorded. Check the collection history before trying again.");
        load(month, false);
      }
    });
  }

  function confirmRemoval() {
    if (!removal || deleting || saving) return;
    const paymentId = removal.id;
    setRemovalError(null);
    startDeleting(async () => {
      try {
        const res = await deleteRentCollection(paymentId);
        if (!res.ok) { setRemovalError(res.error); return; }
        setRemoval(null);
        toast.success("Collection removed");
        load(month, false);
        router.refresh();
      } catch {
        setRemovalError("The result could not be confirmed. Close this review and reload the collection history before trying again.");
      }
    });
  }

  const busy = saving || deleting || loading || outcomeUnknown;

  return (
    <>
    <Dialog open={open} onOpenChange={onDialogOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-2xl"
        onEscapeKeyDown={(event) => { if (saving || deleting) event.preventDefault(); }}
        onInteractOutside={(event) => { if (saving || deleting || removal) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>Collect Rent</DialogTitle>
          <DialogDescription>
            {view ? `${view.tenantName} · ${view.room}` : "Loading tenancy details…"}
          </DialogDescription>
        </DialogHeader>

        {!view ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3" role="status">
            {loadError ? <><p className="text-sm text-destructive" role="alert">{loadError}</p>
              <Button variant="outline" onClick={() => load(month, true)} disabled={loading}>Try again</Button></>
              : <><Loader2 className="size-5 animate-spin text-muted-foreground" /><span className="sr-only">Loading collections</span></>}
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-2">
            {loadError ? <p role="alert" className="text-sm text-destructive">{loadError} <Button variant="link" onClick={() => load(month, false)} disabled={loading}>Retry refresh</Button></p> : null}
            {/* What is owed for the selected month, and what has come in so far. */}
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`${formId}-month`} className="text-xs text-muted-foreground">Billing month</Label>
                  <Input
                    id={`${formId}-month`}
                    type="month"
                    value={month}
                    min={view.firstMonth}
                    onChange={(e) => onMonthChange(e.target.value)}
                    disabled={busy}
                    className="h-9 w-44 bg-background"
                  />
                </div>
                <div className="flex items-center gap-3">
                  {view.state === "PAID" && view.earlierDuePaise > 0
                    ? <StatusBadge meta={{ label: "Month paid · earlier dues", dot: "bg-[#c79a3e]" }} />
                    : <StatusBadge meta={COLLECTION_STATE_META[view.state]} />}
                  {view.status === "OVERDUE" ? (
                    <StatusBadge meta={PAYMENT_STATUS_META.OVERDUE} />
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Metric label="Rent" value={formatINR(view.rentPaise)} />
                <Metric label="Maintenance" value={formatINR(view.maintenancePaise)} />
                <Metric label="Collected" value={formatINR(view.collectedPaise)} />
                <Metric
                  label={view.advancePaise > 0 ? "Over-collected this month" : "This month owed"}
                  value={formatINR(
                    view.advancePaise > 0 ? view.advancePaise : view.balancePaise,
                  )}
                  strong
                />
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                <span>
                  Month due <strong className="text-foreground">{formatINR(view.duePaise)}</strong>
                </span>
                <span>
                  Cash <strong className="text-foreground">{formatINR(view.cashPaise)}</strong>
                </span>
                <span>
                  Online <strong className="text-foreground">{formatINR(view.onlinePaise)}</strong>
                </span>
              </div>
            </div>

            {view.earlierDuePaise > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs text-muted-foreground">
                <span>
                  Also unpaid from earlier months:{" "}
                  <strong className="text-foreground">{formatINR(view.earlierDuePaise)}</strong>
                </span>
                {view.earlierDueMonths.slice(0, 6).map((key) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    disabled={busy}
                    onClick={() => onMonthChange(key)}
                  >
                    {monthLabel(key)}
                  </Button>
                ))}
              </div>
            ) : null}

            {/* New collection */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-amount`} className="text-xs text-muted-foreground">Amount collected (₹)</Label>
                <Input id={`${formId}-amount`} ref={amountRef} autoFocus step="0.01" aria-describedby={error ? `${formId}-error` : undefined}
                  type="number"
                  min={0}
                  inputMode="decimal"
                  placeholder="0"
                  value={fields.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-date`} className="text-xs text-muted-foreground">Collected on</Label>
                <Input id={`${formId}-date`}
                  type="datetime-local"
                  value={fields.collectedAt}
                  max={toDatetimeLocal(new Date())}
                  onChange={(e) => set("collectedAt", e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-method`} className="text-xs text-muted-foreground">Payment method</Label>
                <Select
                  value={fields.method}
                  onValueChange={(v) => set("method", v as PaymentMethod)}
                  disabled={busy}
                >
                  <SelectTrigger id={`${formId}-method`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="ONLINE">Online</SelectItem>
                    <SelectItem value="SPLIT">Split (cash + online)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-note`} className="text-xs text-muted-foreground">Note (optional)</Label>
                <Textarea id={`${formId}-note`}
                  rows={1}
                  placeholder="e.g. UPI ref / paid at the desk"
                  value={fields.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  disabled={busy}
                />
              </div>

              {fields.method === "SPLIT" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${formId}-cash`} className="text-xs text-muted-foreground">Cash (₹)</Label>
                    <Input id={`${formId}-cash`} step="0.01"
                      type="number"
                      min={0}
                      inputMode="decimal"
                      placeholder="0"
                      value={fields.cashAmount}
                      onChange={(e) => set("cashAmount", e.target.value)}
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${formId}-online`} className="text-xs text-muted-foreground">Online (₹)</Label>
                    <Input id={`${formId}-online`} step="0.01"
                      type="number"
                      min={0}
                      inputMode="decimal"
                      placeholder="0"
                      value={fields.onlineAmount}
                      onChange={(e) => set("onlineAmount", e.target.value)}
                      disabled={busy}
                    />
                  </div>
                </>
              ) : null}
            </div>

            {preview && num(fields.amount) > 0 ? (
              <p className="text-xs text-muted-foreground">
                After this entry the month shows{" "}
                <strong className="text-foreground">{formatINR(preview.collected)}</strong> collected
                {preview.advance > 0 ? (
                  <>
                    {" "}
                    — <strong className="text-foreground">{formatINR(preview.advance)}</strong> over-collected.
                    This amount is not automatically applied to later months.
                  </>
                ) : preview.balance > 0 ? (
                  <>
                    {" "}
                    and{" "}
                    <strong className="text-foreground">{formatINR(preview.balance)}</strong> still
                    due (partially paid).
                  </>
                ) : (
                  <> — fully paid.</>
                )}
              </p>
            ) : null}

            <div className="flex items-center gap-2">
              <Checkbox
                id={`send-invoice-${tenancyId}`}
                checked={fields.sendInvoice}
                onCheckedChange={(checked) => set("sendInvoice", checked === true)}
                disabled={busy}
              />
              <Label htmlFor={`send-invoice-${tenancyId}`} className="text-sm font-normal">
                Send the invoice for this payment to the tenant on WhatsApp
              </Label>
            </div>

            {error ? <p id={`${formId}-error`} role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}

            {outcomeUnknown ? <div role="status" className="space-y-2 rounded-lg border p-3 text-sm">
              <p>Recording is paused because the last result is unknown. Check the history below before making another entry.</p>
              <Button variant="outline" disabled={loading || saving || deleting} onClick={() => { setOutcomeUnknown(false); setError(null); }}>I checked history; enable recording</Button>
            </div> : null}
            {/* What has already been collected for this month. */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Collections for {format(new Date(`${month}-01T00:00:00`), "MMMM yyyy")}
              </Label>
              {view.collections.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  Nothing collected for this month yet.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {view.collections.map((c) => (
                    <li key={c.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                      <Banknote className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium tabular-nums">
                          {formatINR(c.amountPaise)}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {PAYMENT_METHOD_META[c.method].label}
                            {c.method === "SPLIT"
                              ? ` · ${formatINR(c.cashPaise)} cash + ${formatINR(c.onlinePaise)} online`
                              : ""}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(c.collectedAt), "dd MMM yyyy 'at' h:mm a")}
                          {c.recordedBy ? ` · recorded by ${c.recordedBy}` : ""}
                        </p>
                        {c.notes ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{c.notes}</p>
                        ) : null}
                      </div>
                      {canDelete ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Review removal of ${formatINR(c.amountPaise)} collected on ${format(new Date(c.collectedAt), "dd MMM yyyy")}`}
                          disabled={busy}
                          onClick={(event) => { removalTrigger.current = event.currentTarget; removalReviewOpen.current = true; setRemovalError(null); setRemoval(c); }}
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 border-t pt-4">
          {error ? <p role="status" className="mr-auto text-sm text-destructive">Review the error above before recording.</p> : null}
          <Button variant="outline" onClick={() => onDialogOpenChange(false)} disabled={saving || deleting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={busy || !view}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Record Collection
          </Button>
        </DialogFooter>
    <AlertDialog open={Boolean(removal)} onOpenChange={(next) => { if (!next && !deleting) setRemoval(null); }}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => {
            if (removalTrigger.current?.isConnected) removalTrigger.current.focus();
            else amountRef.current?.focus();
            removalReviewOpen.current = false;
          });
        }}
        onEscapeKeyDown={(event) => { if (deleting) event.preventDefault(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this collection?</AlertDialogTitle>
          <AlertDialogDescription>
            {removal && view ? `${view.tenantName} · ${formatINR(removal.amountPaise)} · ${PAYMENT_METHOD_META[removal.method].label} · ${format(new Date(removal.collectedAt), "dd MMM yyyy 'at' h:mm a")} · ${monthLabel(month)} rent.` : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm">This permanently removes the payment record and recalculates the balance. There is no undo. An invoice already issued or sent is not updated by this removal.</p>
        {removalError ? <p role="alert" className="text-sm text-destructive">{removalError}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Keep collection</AlertDialogCancel>
          <Button variant="destructive" onClick={confirmRemoval} disabled={deleting}>
            {deleting ? <Loader2 className="size-4 animate-spin" /> : null} Remove collection
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
      </DialogContent>
    </Dialog>
    </>
  );
}

function Metric({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          strong
            ? "text-lg font-bold tabular-nums text-foreground"
            : "text-base tabular-nums text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}
