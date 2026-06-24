"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Download, Search } from "lucide-react";

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
import { formatINR, paiseToRupees } from "@/lib/money";
import type { TenantListItem } from "@/lib/queries/tenants";
import { PAYMENT_STATUS_META } from "@/lib/status";

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function exportCsv(rows: TenantListItem[]) {
  const headers = [
    "Name",
    "Phone",
    "Status",
    "Room",
    "Bed",
    "Monthly Rent",
    "Payment",
    "Occupation",
    "Joined",
  ];
  const lines = [headers.join(",")];
  for (const t of rows) {
    const active = t.tenancies[0];
    lines.push(
      [
        t.fullName,
        t.phone,
        active ? "Current" : "Past",
        active?.bed.room.number ?? "",
        active?.bed.label ?? "",
        active ? String(paiseToRupees(active.monthlyRent)) : "",
        active?.paymentStatus ?? "",
        t.occupation ?? "",
        format(t.createdAt, "yyyy-MM-dd"),
      ]
        .map((v) => csvCell(String(v)))
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tenants-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TenantsClient({ tenants }: { tenants: TenantListItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sort, setSort] = useState<string>("name");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = tenants.filter((t) => {
      const isCurrent = t.tenancies.length > 0;
      if (statusFilter === "CURRENT" && !isCurrent) return false;
      if (statusFilter === "PAST" && isCurrent) return false;
      if (query && !`${t.fullName} ${t.phone}`.toLowerCase().includes(query)) return false;
      return true;
    });
    list.sort((a, b) =>
      sort === "recent"
        ? b.createdAt.getTime() - a.createdAt.getTime()
        : a.fullName.localeCompare(b.fullName),
    );
    return list;
  }, [tenants, q, statusFilter, sort]);

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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All tenants</SelectItem>
            <SelectItem value="CURRENT">Current</SelectItem>
            <SelectItem value="PAST">Past</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort: Name</SelectItem>
            <SelectItem value="recent">Sort: Recently added</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button variant="outline" onClick={() => exportCsv(filtered)} disabled={filtered.length === 0}>
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead className="w-36">Phone</TableHead>
              <TableHead className="w-28">Room / Bed</TableHead>
              <TableHead className="w-28">Rent</TableHead>
              <TableHead className="w-28">Payment</TableHead>
              <TableHead className="w-24">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  No tenants match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t) => {
                const active = t.tenancies[0];
                return (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/tenants/${t.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium">{t.fullName}</div>
                      {t.occupation ? (
                        <div className="text-xs text-muted-foreground">{t.occupation}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{t.phone}</TableCell>
                    <TableCell className="text-sm">
                      {active ? `${active.bed.room.number} · ${active.bed.label}` : "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {active ? formatINR(active.monthlyRent) : "—"}
                    </TableCell>
                    <TableCell>
                      {active ? (
                        <StatusBadge meta={PAYMENT_STATUS_META[active.paymentStatus]} />
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {active ? (
                        <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
                          <span className="size-1.5 rounded-full bg-available" />
                          Current
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Past</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} of {tenants.length} tenants
      </p>
    </div>
  );
}
