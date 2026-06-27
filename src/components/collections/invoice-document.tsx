import Image from "next/image";
import { format, parseISO } from "date-fns";

import type { InvoiceView } from "@/lib/invoice-compute";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

const fmtDate = (iso: string) => format(parseISO(iso), "dd MMM yyyy");
const fmtMonth = (iso: string) => format(parseISO(iso), "MMMM yyyy");

/**
 * Presentational A4-style invoice. This is the on-screen preview AND mirrors the PDF
 * layout (src/lib/invoice.ts) field-for-field, so staff see exactly what is sent.
 * Amounts use the ₹ glyph here (HTML); the PDF uses "Rs." due to font limitations.
 */
export function InvoiceDocument({
  data,
  className,
}: {
  data: InvoiceView;
  className?: string;
}) {
  const rows: Array<{ label: string; amount: number; negative?: boolean }> = [
    { label: "Rent", amount: data.rentPaise },
    { label: "Maintenance", amount: data.maintenancePaise },
  ];
  if (data.previousDuePaise > 0) rows.push({ label: "Previous Due", amount: data.previousDuePaise });
  if (data.extraChargesPaise > 0) {
    rows.push({ label: data.extraChargesLabel?.trim() || "Extra Charges", amount: data.extraChargesPaise });
  }
  if (data.discountPaise > 0) {
    rows.push({ label: "Discount", amount: data.discountPaise, negative: true });
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-white p-6 text-[#1c1d22] shadow-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Image src="/logo.png" alt="Triya" width={120} height={40} className="h-8 w-auto" priority />
          <p className="pt-1 text-sm font-semibold">{data.propertyName}</p>
          {data.propertyAddress ? (
            <p className="text-xs text-muted-foreground">{data.propertyAddress}</p>
          ) : null}
          {data.propertyPhone ? (
            <p className="text-xs text-muted-foreground">Phone: {data.propertyPhone}</p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tracking-tight">RENT INVOICE</p>
          <p className="text-xs text-muted-foreground">#{data.number}</p>
        </div>
      </div>

      <div className="my-4 h-px bg-border" />

      {/* Billed to + invoice details */}
      <div className="flex justify-between gap-6">
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Billed To
          </p>
          <p className="text-sm font-semibold">{data.tenantName}</p>
          <p className="text-xs text-muted-foreground">Phone: {data.tenantPhone}</p>
          <p className="text-xs text-muted-foreground">Joined: {fmtDate(data.dateOfJoining)}</p>
          <p className="text-xs text-muted-foreground">
            Room {data.roomNumber} · Bed {data.bedLabel}
          </p>
        </div>
        <div className="min-w-[180px] space-y-1 text-xs">
          <Detail label="Invoice Date" value={fmtDate(data.issueDate)} />
          <Detail label="Billing Month" value={fmtMonth(data.billingMonth)} />
          <Detail label="Due Date" value={data.dueDate ? fmtDate(data.dueDate) : "—"} />
          <Detail label="Status" value={data.paymentStatusLabel} strong />
        </div>
      </div>

      {/* Charges */}
      <div className="mt-5 overflow-hidden rounded-md border">
        <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Description</span>
          <span>Amount</span>
        </div>
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between border-t px-3 py-2 text-sm"
          >
            <span>{r.label}</span>
            <span className="tabular-nums">
              {r.negative ? "− " : ""}
              {formatINR(r.amount)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatINR(data.subtotalPaise)}</span>
        </div>
        <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2.5 text-sm font-bold">
          <span>Total Due</span>
          <span className="tabular-nums">{formatINR(data.totalPaise)}</span>
        </div>
      </div>

      {data.notes?.trim() ? (
        <div className="mt-4 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Notes
          </p>
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">{data.notes}</p>
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
        <span>Thank you for staying with us.</span>
        <span>Generated by Triya Manager</span>
      </div>
    </div>
  );
}

function Detail({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : undefined}>{value}</span>
    </div>
  );
}
