"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Loader2, Search } from "lucide-react";

import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
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
import { matchesPaymentFilter, PAYMENT_FILTER_OPTIONS, type PaymentFilter } from "@/lib/rent";
import { COLLECTION_STATE_META } from "@/lib/status";
import { InvoiceHistory } from "./invoice-history";
import { CollectionsRowActions } from "./row-actions";

type DuesFilter = PaymentFilter | "EARLIER";

const FILTERS: { value: DuesFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  ...PAYMENT_FILTER_OPTIONS.filter((o) => o.value !== "ALL"),
  { value: "EARLIER", label: "Earlier dues" },
];

function matches(filter: DuesFilter, row: CollectionRow): boolean {
  return filter === "EARLIER" ? row.earlierDuePaise > 0 : matchesPaymentFilter(filter, row);
}

export function CollectionsClient({
  rows,
  invoices,
  canDelete,
  month,
  monthOptions,
  isCurrentMonth,
  isFlat,
}: {
  rows: CollectionRow[];
  invoices: InvoiceHistoryRow[];
  /** ADMIN/MANAGER may remove a wrongly entered collection. */
  canDelete: boolean;
  /** Billing month being viewed, YYYY-MM. */
  month: string;
  monthOptions: { value: string; label: string }[];
  isCurrentMonth: boolean;
  isFlat: boolean;
}) {
  return (
    <Tabs defaultValue="dues" className="space-y-5">
      <TabsList>
        <TabsTrigger value="dues">Dues</TabsTrigger>
        <TabsTrigger value="history">Invoice History</TabsTrigger>
      </TabsList>
      <TabsContent value="dues">
        <DuesTab
          rows={rows}
          canDelete={canDelete}
          month={month}
          monthOptions={monthOptions}
          isCurrentMonth={isCurrentMonth}
          isFlat={isFlat}
        />
      </TabsContent>
      <TabsContent value="history">
        <InvoiceHistory invoices={invoices} />
      </TabsContent>
    </Tabs>
  );
}

function DuesTab({
  rows,
  canDelete,
  month,
  monthOptions,
  isCurrentMonth,
  isFlat,
}: {
  rows: CollectionRow[];
  canDelete: boolean;
  month: string;
  monthOptions: { value: string; label: string }[];
  isCurrentMonth: boolean;
  isFlat: boolean;
}) {
  const router = useRouter();
  const [navigating, startNavigating] = useTransition();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<DuesFilter>("ALL");

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.value, rows.filter((r) => matches(f.value, r)).length])),
    [rows],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matches(filter, r)) return false;
      if (query && !`${r.tenant.fullName} ${r.tenant.phone} ${r.bed.room.number}`.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [rows, q, filter]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (sum, r) => ({
          due: sum.due + r.duePaise,
          collected: sum.collected + r.collectedPaise,
          cash: sum.cash + r.cashPaise,
          online: sum.online + r.onlinePaise,
          balance: sum.balance + r.balancePaise,
          earlier: sum.earlier + r.earlierDuePaise,
        }),
        { due: 0, collected: 0, cash: 0, online: 0, balance: 0, earlier: 0 },
      ),
    [filtered],
  );

  function onMonthChange(next: string) {
    startNavigating(() => router.push(`/collections?month=${next}`));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={month} onValueChange={onMonthChange} disabled={navigating}>
          <SelectTrigger className="w-48">
            {navigating ? <Loader2 className="size-4 animate-spin" /> : null}
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone or room"
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? "default" : "outline"}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            <span className="tabular-nums opacity-70">{counts[f.value]}</span>
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 border-y border-border py-20 text-center">
          <Inbox className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No active tenants owe rent for this month.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border-y border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="w-24">{isFlat ? "Flat" : "Room"}</TableHead>
                  <TableHead className="w-28 text-right">Month Due (₹)</TableHead>
                  <TableHead className="w-28 text-right">Collected (₹)</TableHead>
                  <TableHead className="w-28 text-right">Balance (₹)</TableHead>
                  <TableHead className="w-32 text-right">Earlier Dues (₹)</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-12 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
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
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <p className="font-semibold">{r.tenant.fullName}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {r.tenant.phone}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {isFlat ? r.bed.room.number : `${r.bed.room.number} · ${r.bed.label}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(r.duePaise)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(r.collectedPaise)}
                        {r.collectionCount > 1 ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({r.collectionCount})
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatINR(r.balancePaise)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.earlierDuePaise > 0 ? (
                          <>
                            {formatINR(r.earlierDuePaise)}
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({r.earlierDueMonths.length} mo)
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <StatusBadge meta={COLLECTION_STATE_META[r.state]} />
                          {r.state !== "PAID" ? (
                            <p
                              className={
                                r.status === "OVERDUE"
                                  ? "text-xs font-medium text-destructive"
                                  : "text-xs text-muted-foreground"
                              }
                            >
                              {r.status === "OVERDUE" ? "Overdue" : "Due"} {r.dueDateLabel}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <CollectionsRowActions
                          tenancyId={r.id}
                          month={month}
                          // Reminders describe today's position, so a past month's row
                          // cannot tell whether anything is still owed — let the server decide.
                          canRemind={!isCurrentMonth || r.outstandingPaise > 0}
                          canDelete={canDelete}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              {filtered.length} of {rows.length} active tenants
            </span>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                Due <strong className="text-foreground">{formatINR(totals.due)}</strong>
              </span>
              <span>
                Collected <strong className="text-foreground">{formatINR(totals.collected)}</strong>{" "}
                (cash {formatINR(totals.cash)} · online {formatINR(totals.online)})
              </span>
              <span>
                Balance <strong className="text-foreground">{formatINR(totals.balance)}</strong>
              </span>
              {totals.earlier > 0 ? (
                <span>
                  Earlier dues <strong className="text-foreground">{formatINR(totals.earlier)}</strong>
                </span>
              ) : null}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
