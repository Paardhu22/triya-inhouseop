"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Inbox, Search } from "lucide-react";

import { StatusBadge } from "@/components/common/status-badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatINR } from "@/lib/money";
import type { CollectionRow } from "@/lib/queries/collections";
import type { InvoiceHistoryRow } from "@/lib/queries/invoices";
import { PAYMENT_STATUS_META } from "@/lib/status";
import { InvoiceHistory } from "./invoice-history";
import { SendInvoiceButton } from "./send-invoice-button";

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "PAID", label: "Paid" },
] as const;

export function CollectionsClient({
  rows,
  invoices,
}: {
  rows: CollectionRow[];
  invoices: InvoiceHistoryRow[];
}) {
  return (
    <Tabs defaultValue="dues" className="space-y-5">
      <TabsList>
        <TabsTrigger value="dues">Dues</TabsTrigger>
        <TabsTrigger value="history">Invoice History</TabsTrigger>
      </TabsList>
      <TabsContent value="dues">
        <DuesTab rows={rows} />
      </TabsContent>
      <TabsContent value="history">
        <InvoiceHistory invoices={invoices} />
      </TabsContent>
    </Tabs>
  );
}

function DuesTab({ rows }: { rows: CollectionRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("ALL");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "ALL" && r.paymentStatus !== status) return false;
      if (query && !`${r.tenant.fullName} ${r.tenant.phone}`.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [rows, q, status]);

  // Distinguish "no active tenants at all" from "filters matched nothing".
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-20 text-center">
        <Inbox className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No active tenants found for this property.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or phone"
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-36">Phone</TableHead>
              <TableHead className="w-28">Room</TableHead>
              <TableHead className="w-28 text-right">Rent (₹)</TableHead>
              <TableHead className="w-32 text-right">Total Due (₹)</TableHead>
              <TableHead className="w-36">Last Invoice</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-36 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                  No tenants match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const totalDue = r.monthlyRent + r.maintenanceCharge;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.tenant.fullName}</TableCell>
                    <TableCell className="text-sm tabular-nums">{r.tenant.phone}</TableCell>
                    <TableCell className="text-sm">
                      {r.bed.room.number} · {r.bed.label}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(r.monthlyRent)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatINR(totalDue)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.invoices[0] ? format(new Date(r.invoices[0].createdAt), "MMM d, yyyy") : "Never"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge meta={PAYMENT_STATUS_META[r.paymentStatus]} />
                    </TableCell>
                    <TableCell className="text-right">
                      <SendInvoiceButton tenancyId={r.id} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} of {rows.length} active tenants
      </p>
    </div>
  );
}
