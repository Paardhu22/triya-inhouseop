"use client";

import { useTransition } from "react";
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
import { formatINR } from "@/lib/money";
import type { InvoiceHistoryRow } from "@/lib/queries/invoices";

const STATUS_META = {
  SENT: { label: "Sent", dot: "bg-available" },
  FAILED: { label: "Not sent", dot: "bg-occupied" },
} as const;

export function InvoiceHistory({ invoices }: { invoices: InvoiceHistoryRow[] }) {
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
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-44">Invoice #</TableHead>
            <TableHead>Tenant</TableHead>
            <TableHead className="w-28">Room</TableHead>
            <TableHead className="w-28">Billing Month</TableHead>
            <TableHead className="w-28 text-right">Total (₹)</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="w-28">Sent</TableHead>
            <TableHead className="w-40 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: InvoiceHistoryRow }) {
  const [pending, startTransition] = useTransition();

  function onResend() {
    startTransition(async () => {
      const res = await resendInvoice(invoice.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Invoice resent on WhatsApp");
    });
  }

  const room = `${invoice.tenancy.bed.room.number} · ${invoice.tenancy.bed.label}`;

  return (
    <TableRow>
      <TableCell className="font-medium tabular-nums">{invoice.number}</TableCell>
      <TableCell>{invoice.tenant.fullName}</TableCell>
      <TableCell className="text-sm">{room}</TableCell>
      <TableCell className="text-sm">{format(invoice.billingMonth, "MMM yyyy")}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {formatINR(invoice.totalPaise)}
      </TableCell>
      <TableCell>
        <StatusBadge meta={STATUS_META[invoice.status]} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {invoice.sentAt ? format(invoice.sentAt, "dd MMM yyyy") : "—"}
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
            Resend
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
