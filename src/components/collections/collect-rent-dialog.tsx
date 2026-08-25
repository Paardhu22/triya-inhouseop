"use client";

import {
  useCallback,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { collectRent, deleteRentCollection, getRentCollection } from "@/lib/actions/collections";
import { formatINR, paiseToRupees } from "@/lib/money";
import { PAYMENT_METHOD_META, type RentCollectionView } from "@/lib/rent";
import { PAYMENT_STATUS_META } from "@/lib/status";
import { collectRentSchema } from "@/lib/validations/collections";
import type { PaymentMethod } from "@/generated/prisma/client";

type Fields = {
  amount: string;
  method: PaymentMethod;
  cashAmount: string;
  onlineAmount: string;
  collectedAt: string;
  notes: string;
};

/** `datetime-local` wants local wall-clock time, which toISOString() would shift. */
function toDatetimeLocal(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

const num = (s: string) => (s.trim() === "" ? 0 : Number(s));

function defaultFields(view: RentCollectionView): Fields {
  return {
    // Pre-fill with what is still owed — the overwhelmingly common case — but leave it
    // editable so a part payment can be recorded as it actually happened.
    amount: view.balancePaise > 0 ? String(paiseToRupees(view.balancePaise)) : "",
    method: "CASH",
    cashAmount: "",
    onlineAmount: "",
    collectedAt: toDatetimeLocal(new Date()),
    notes: "",
  };
}

/**
 * Record a rent collection against one active tenancy: how much came in, how it was
 * split between cash and online, and when it was handed over. Also shows the month's
 * collection history so staff can see what has already been received before adding to
 * it. Replaces the old all-or-nothing "Mark as Paid".
 */
/** Imperative handle so a parent can open the dialog (and load its data) on demand. */
export type CollectRentHandle = { open: () => void };

export function CollectRentDialog({
  tenancyId,
  canDelete = false,
  onCollected,
  ref,
}: {
  tenancyId: string;
  /** ADMIN/MANAGER may remove a wrongly entered collection. */
  canDelete?: boolean;
  /** Fired after a successful collection, with the month's remaining balance. */
  onCollected?: (result: { fullyPaid: boolean; balancePaise: number }) => void;
  ref?: Ref<CollectRentHandle>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [view, setView] = useState<RentCollectionView | null>(null);
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState<Fields>({
    amount: "",
    method: "CASH",
    cashAmount: "",
    onlineAmount: "",
    collectedAt: toDatetimeLocal(new Date()),
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    setError(null);
  }

  const load = useCallback(
    (targetMonth: string, resetFields: boolean) => {
      setLoading(true);
      getRentCollection(tenancyId, targetMonth).then((res) => {
        setLoading(false);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setView(res.data);
        if (resetFields) setFields(defaultFields(res.data));
      });
    },
    [tenancyId],
  );

  // Open and load fresh figures in one step. Driven imperatively (same shape as
  // InvoicePreviewDialog) rather than by a controlled `open` prop: Radix does not fire
  // onOpenChange when a parent flips the prop, so a controlled dialog would never load.
  const openAndLoad = useCallback(() => {
    setOpen(true);
    const current = format(new Date(), "yyyy-MM");
    setMonth(current);
    setView(null);
    setError(null);
    load(current, true);
  }, [load]);

  useImperativeHandle(ref, () => ({ open: openAndLoad }), [openAndLoad]);

  function onDialogOpenChange(next: boolean) {
    if (next) openAndLoad();
    else setOpen(false);
  }

  function onMonthChange(next: string) {
    if (!next) return;
    setMonth(next);
    setView(null);
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
    const input = {
      tenancyId,
      forMonth: month,
      amount: num(fields.amount),
      method: fields.method,
      cashAmount: fields.method === "SPLIT" ? num(fields.cashAmount) : undefined,
      onlineAmount: fields.method === "SPLIT" ? num(fields.onlineAmount) : undefined,
      collectedAt: fields.collectedAt,
      notes: fields.notes.trim() || undefined,
    };
    const parsed = collectRentSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the collection details");
      return;
    }

    startSaving(async () => {
      const res = await collectRent(parsed.data);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(
        res.data.fullyPaid
          ? "Collection recorded. This month is fully paid."
          : `Collection recorded. ${formatINR(res.data.balancePaise)} still due.`,
      );
      setOpen(false);
      router.refresh();
      onCollected?.(res.data);
    });
  }

  function onDelete(paymentId: string) {
    startDeleting(async () => {
      const res = await deleteRentCollection(paymentId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Collection removed");
      load(month, false);
      router.refresh();
    });
  }

  const busy = saving || deleting || loading;

  return (
    <Dialog open={open} onOpenChange={onDialogOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Collect Rent</DialogTitle>
          <DialogDescription>
            {view ? `${view.tenantName} · ${view.room}` : "Loading tenancy details…"}
          </DialogDescription>
        </DialogHeader>

        {!view ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* What is owed for the selected month, and what has come in so far. */}
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Billing month</Label>
                  <Input
                    type="month"
                    value={month}
                    onChange={(e) => onMonthChange(e.target.value)}
                    disabled={busy}
                    className="h-9 w-44 bg-background"
                  />
                </div>
                <StatusBadge meta={PAYMENT_STATUS_META[view.status]} />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Metric label="Rent" value={formatINR(view.rentPaise)} />
                <Metric label="Maintenance" value={formatINR(view.maintenancePaise)} />
                <Metric label="Collected" value={formatINR(view.collectedPaise)} />
                <Metric
                  label={view.advancePaise > 0 ? "Advance" : "Balance"}
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

            {/* New collection */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Amount collected (₹)</Label>
                <Input
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
                <Label className="text-xs text-muted-foreground">Collected on</Label>
                <Input
                  type="datetime-local"
                  value={fields.collectedAt}
                  max={toDatetimeLocal(new Date())}
                  onChange={(e) => set("collectedAt", e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Payment method</Label>
                <Select
                  value={fields.method}
                  onValueChange={(v) => set("method", v as PaymentMethod)}
                  disabled={busy}
                >
                  <SelectTrigger className="w-full">
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
                <Label className="text-xs text-muted-foreground">Note (optional)</Label>
                <Textarea
                  rows={1}
                  placeholder="e.g. paid at the desk"
                  value={fields.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  disabled={busy}
                />
              </div>

              {fields.method === "SPLIT" ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Cash (₹)</Label>
                    <Input
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
                    <Label className="text-xs text-muted-foreground">Online (₹)</Label>
                    <Input
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
                    — <strong className="text-foreground">{formatINR(preview.advance)}</strong> in
                    advance.
                  </>
                ) : (
                  <>
                    {" "}
                    and{" "}
                    <strong className="text-foreground">{formatINR(preview.balance)}</strong> still
                    due.
                  </>
                )}
              </p>
            ) : null}

            {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

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
                          aria-label="Remove collection"
                          disabled={busy}
                          onClick={() => onDelete(c.id)}
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

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={busy || !view}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Record Collection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
            ? "text-base font-semibold tabular-nums text-foreground"
            : "text-base tabular-nums text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}
