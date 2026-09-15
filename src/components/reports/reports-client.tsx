"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Download, Inbox, Loader2, Search } from "lucide-react";

import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
import { formatINR, paiseToRupees } from "@/lib/money";
import type { RentReport } from "@/lib/queries/reports";
import { matchesPaymentFilter, PAYMENT_FILTER_OPTIONS, type PaymentFilter } from "@/lib/rent";
import { COLLECTION_STATE_META } from "@/lib/status";

type Tab = "floor" | "room" | "tenant";

const TAB_LABEL: Record<Tab, string> = {
  floor: "By Floor",
  room: "By Room",
  tenant: "By Tenant",
};

/** Rupees with no symbol — spreadsheets should see a number, not "₹1,234". */
const csvAmount = (paise: number) => paiseToRupees(paise).toFixed(2);

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
  // BOM so Excel reads the ₹-free UTF-8 names (and any non-ASCII tenant name) correctly.
  const url = URL.createObjectURL(new Blob([`﻿${body}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsClient({ report, isFlat }: { report: RentReport; isFlat: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("floor");
  const [q, setQ] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("ALL");
  const [navigating, startNavigating] = useTransition();

  const roomNoun = isFlat ? "Flat" : "Room";
  const query = q.trim().toLowerCase();

  const byFloor = useMemo(
    () => report.byFloor.filter((r) => !query || r.label.toLowerCase().includes(query)),
    [report.byFloor, query],
  );
  const byRoom = useMemo(
    () =>
      report.byRoom.filter(
        (r) =>
          !query ||
          `${r.number} ${r.floorLabel}`.toLowerCase().includes(query),
      ),
    [report.byRoom, query],
  );
  const byTenant = useMemo(
    () =>
      report.byTenant.filter(
        (r) =>
          matchesPaymentFilter(paymentFilter, r) &&
          (!query ||
            `${r.tenantName} ${r.roomNumber} ${r.bedLabel}`.toLowerCase().includes(query)),
      ),
    [report.byTenant, query, paymentFilter],
  );

  function onMonthChange(month: string) {
    startNavigating(() => router.push(`/reports?month=${month}`));
  }

  function onExport() {
    const suffix = `${report.month}-${tab}`;
    if (tab === "floor") {
      downloadCsv(`rent-report-${suffix}.csv`, [
        ["Floor", "Tenants", "Expected", "Collected", "Cash", "Online", "Outstanding"],
        ...byFloor.map((r) => [
          r.label,
          r.tenancies,
          csvAmount(r.expectedPaise),
          csvAmount(r.collectedPaise),
          csvAmount(r.cashPaise),
          csvAmount(r.onlinePaise),
          csvAmount(r.outstandingPaise),
        ]),
      ]);
      return;
    }
    if (tab === "room") {
      downloadCsv(`rent-report-${suffix}.csv`, [
        [roomNoun, "Floor", "Sharing", "Tenants", "Expected", "Collected", "Cash", "Online", "Outstanding"],
        ...byRoom.map((r) => [
          r.number,
          r.floorLabel,
          r.sharingType,
          r.tenancies,
          csvAmount(r.expectedPaise),
          csvAmount(r.collectedPaise),
          csvAmount(r.cashPaise),
          csvAmount(r.onlinePaise),
          csvAmount(r.outstandingPaise),
        ]),
      ]);
      return;
    }
    downloadCsv(`rent-report-${suffix}.csv`, [
      ["Tenant", roomNoun, "Bed", "Floor", "Expected", "Collected", "Cash", "Online", "Balance", "Last paid", "Status"],
      ...byTenant.map((r) => [
        r.tenantName,
        r.roomNumber,
        isFlat ? "" : r.bedLabel,
        r.floorLabel,
        csvAmount(r.expectedPaise),
        csvAmount(r.collectedPaise),
        csvAmount(r.cashPaise),
        csvAmount(r.onlinePaise),
        csvAmount(r.balancePaise),
        r.lastPaidAt ? format(new Date(r.lastPaidAt), "yyyy-MM-dd HH:mm") : "",
        `${COLLECTION_STATE_META[r.state].label}${r.status === "OVERDUE" ? " (overdue)" : ""}`,
      ]),
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={report.month} onValueChange={onMonthChange} disabled={navigating}>
          <SelectTrigger className="w-48">
            {navigating ? <Loader2 className="size-4 animate-spin" /> : null}
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {report.availableMonths.map((m) => (
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
            placeholder={`Search floor, ${roomNoun.toLowerCase()} or tenant`}
            className="pl-8"
          />
        </div>

        {tab === "tenant" ? (
          <Select value={paymentFilter} onValueChange={(v) => setPaymentFilter(v as PaymentFilter)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Button variant="outline" className="sm:ml-auto" onClick={onExport}>
          <Download className="size-4" />
          Export {TAB_LABEL[tab]}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="floor">By Floor</TabsTrigger>
          <TabsTrigger value="room">By {roomNoun}</TabsTrigger>
          <TabsTrigger value="tenant">By Tenant</TabsTrigger>
        </TabsList>

        <TabsContent value="floor">
          <TableShell empty={byFloor.length === 0} label="floors">
            <TableHeader>
              <TableRow>
                <TableHead>Floor</TableHead>
                <TableHead className="w-24 text-right">Tenants</TableHead>
                <TableHead className="w-32 text-right">Expected (₹)</TableHead>
                <TableHead className="w-32 text-right">Collected (₹)</TableHead>
                <TableHead className="w-28 text-right">Cash (₹)</TableHead>
                <TableHead className="w-28 text-right">Online (₹)</TableHead>
                <TableHead className="w-32 text-right">Outstanding (₹)</TableHead>
                <TableHead className="w-36">Collected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byFloor.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.tenancies}</TableCell>
                  <Amounts row={r} />
                  <TableCell>
                    <RateBar collected={r.collectedPaise} expected={r.expectedPaise} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableShell>
        </TabsContent>

        <TabsContent value="room">
          <TableShell empty={byRoom.length === 0} label={`${roomNoun.toLowerCase()}s`}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">{roomNoun}</TableHead>
                <TableHead>Floor</TableHead>
                {!isFlat ? <TableHead className="w-24 text-right">Sharing</TableHead> : null}
                <TableHead className="w-24 text-right">Tenants</TableHead>
                <TableHead className="w-32 text-right">Expected (₹)</TableHead>
                <TableHead className="w-32 text-right">Collected (₹)</TableHead>
                <TableHead className="w-28 text-right">Cash (₹)</TableHead>
                <TableHead className="w-28 text-right">Online (₹)</TableHead>
                <TableHead className="w-32 text-right">Outstanding (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byRoom.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium tabular-nums">{r.number}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.floorLabel}</TableCell>
                  {!isFlat ? (
                    <TableCell className="text-right tabular-nums">{r.sharingType}</TableCell>
                  ) : null}
                  <TableCell className="text-right tabular-nums">{r.tenancies}</TableCell>
                  <Amounts row={r} />
                </TableRow>
              ))}
            </TableBody>
          </TableShell>
        </TabsContent>

        <TabsContent value="tenant">
          <TableShell empty={byTenant.length === 0} label="tenants">
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead className="w-28">{roomNoun}</TableHead>
                <TableHead className="w-32 text-right">Expected (₹)</TableHead>
                <TableHead className="w-32 text-right">Collected (₹)</TableHead>
                <TableHead className="w-28 text-right">Cash (₹)</TableHead>
                <TableHead className="w-28 text-right">Online (₹)</TableHead>
                <TableHead className="w-28 text-right">Balance (₹)</TableHead>
                <TableHead className="w-40">Last collected</TableHead>
                <TableHead className="w-28">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byTenant.map((r) => (
                <TableRow key={r.tenancyId}>
                  <TableCell className="font-medium">
                    {r.tenantName}
                    {!r.isActive ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        moved out
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {isFlat ? r.roomNumber : `${r.roomNumber} · ${r.bedLabel}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(r.expectedPaise)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(r.collectedPaise)}
                    {r.collectionCount > 1 ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({r.collectionCount})
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(r.cashPaise)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(r.onlinePaise)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatINR(r.balancePaise)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.lastPaidAt
                      ? format(new Date(r.lastPaidAt), "dd MMM, h:mm a")
                      : "Not collected"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge meta={COLLECTION_STATE_META[r.state]} />
                    {r.status === "OVERDUE" ? (
                      <p className="text-xs font-medium text-destructive">Overdue</p>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableShell>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** The four money columns every roll-up shares. */
function Amounts({
  row,
}: {
  row: {
    expectedPaise: number;
    collectedPaise: number;
    cashPaise: number;
    onlinePaise: number;
    outstandingPaise: number;
  };
}) {
  return (
    <>
      <TableCell className="text-right tabular-nums">{formatINR(row.expectedPaise)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatINR(row.collectedPaise)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatINR(row.cashPaise)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatINR(row.onlinePaise)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {formatINR(row.outstandingPaise)}
      </TableCell>
    </>
  );
}

function RateBar({ collected, expected }: { collected: number; expected: number }) {
  const pct = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className="h-1.5 w-20" />
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

function TableShell({
  empty,
  label,
  children,
}: {
  empty: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-20 text-center">
        <Inbox className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No {label} to report for this month.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>{children}</Table>
    </div>
  );
}
