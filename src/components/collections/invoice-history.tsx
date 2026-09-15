"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ExternalLink, Inbox, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resendInvoice } from "@/lib/actions/collections";
import { invoiceBalancePaise } from "@/lib/invoice-compute";
import { formatINR } from "@/lib/money";
import type { InvoiceHistoryRow } from "@/lib/queries/invoices";

const STATUS_META = {
  SENT: { label: "Sent", dot: "bg-available" },
  FAILED: { label: "Not sent", dot: "bg-occupied" },
} as const;

type Filter = "ALL" | "SENT" | "FAILED";

export function InvoiceHistory({ invoices }: { invoices: InvoiceHistoryRow[] }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const notSent = invoices.filter((i) => i.status === "FAILED").length;
  const shown = useMemo(
    () => (filter === "ALL" ? invoices : invoices.filter((i) => i.status === filter)),
    [invoices, filter],
  );

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-20 text-center">
        <Inbox className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No invoices have been generated for this property yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["ALL", "All", invoices.length],
            ["SENT", "Sent", invoices.length - notSent],
            ["FAILED", "Not sent", notSent],
          ] as const
        ).map(([value, label, count]) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? "default" : "outline"}
            onClick={() => setFilter(value)}
          >
            {label}
            <span className="tabular-nums opacity-70">{count}</span>
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">Invoice #</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead className="w-24">Room</TableHead>
              <TableHead className="w-28">Billing Month</TableHead>
              <TableHead className="w-28 text-right">Total (₹)</TableHead>
              <TableHead className="w-28 text-right">Paid (₹)</TableHead>
              <TableHead className="w-28 text-right">Balance (₹)</TableHead>
              <TableHead className="w-44">Status</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
                  No invoices match this filter.
                </TableCell>
              </TableRow>
            ) : (
              shown.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} />)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: InvoiceHistoryRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onResend() {
    startTransition(async () => {
      const res = await resendInvoice(invoice.id);
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
        return;
      }
      toast.success("Invoice resent on WhatsApp");
      router.refresh();
    });
  }

  const room = `${invoice.tenancy.bed.room.number} · ${invoice.tenancy.bed.label}`;

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium tabular-nums">{invoice.number}</p>
        <p className="text-xs text-muted-foreground">
          {invoice.receivedPaise !== null
            ? `For a payment of ${formatINR(invoice.receivedPaise)}`
            : "Bill"}
        </p>
      </TableCell>
      <TableCell>{invoice.tenant.fullName}</TableCell>
      <TableCell className="text-sm">{room}</TableCell>
      <TableCell className="text-sm">{format(invoice.billingMonth, "MMM yyyy")}</TableCell>
      <TableCell className="text-right tabular-nums">{formatINR(invoice.totalPaise)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatINR(invoice.paidPaise)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {formatINR(invoiceBalancePaise(invoice.totalPaise, invoice.paidPaise))}
      </TableCell>
      <TableCell>
        <StatusBadge meta={STATUS_META[invoice.status]} />
        <p className="mt-0.5 text-xs text-muted-foreground">
          {invoice.status === "SENT" && invoice.sentAt
            ? format(invoice.sentAt, "dd MMM yyyy")
            : invoice.lastError
              ? <span className="line-clamp-2" title={invoice.lastError}>{invoice.lastError}</span>
              : null}
        </p>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {invoice.storageKey ? (
            <Button asChild variant="ghost" size="sm">
              <a
                href={`/api/files/${invoice.storageKey}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-4" />
                View
              </a>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={onResend}
            disabled={pending || !invoice.storageKey}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {invoice.status === "FAILED" ? "Send" : "Resend"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
