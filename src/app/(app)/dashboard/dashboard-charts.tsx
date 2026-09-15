"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatINR, formatINRCompact } from "@/lib/money";
import type { DashboardData } from "@/lib/queries/dashboard";

/** "2 sharing", "3 sharing" — the vocabulary staff actually use for a room. */
export function sharingLabel(sharingType: number, isFlat: boolean): string {
  if (isFlat) return "Flat";
  if (sharingType === 1) return "Single";
  return `${sharingType} sharing`;
}

const occupancyConfig = {
  occupied: { label: "Occupied", color: "var(--chart-1)" },
  available: { label: "Available", color: "var(--chart-4)" },
} satisfies ChartConfig;

const moneyConfig = {
  collected: { label: "Collected", color: "var(--chart-1)" },
  expenses: { label: "Expenses", color: "var(--chart-5)" },
} satisfies ChartConfig;

const panel = "space-y-4 rounded-xl border border-border bg-card p-6";
const heading = "text-[0.8rem] font-bold tracking-[0.08em] text-muted-foreground uppercase";

/**
 * Mark geometry, shared by every chart here.
 *
 * Bars are *capped*, never left to fill their band — a property with two sharing
 * types should get two thin bars, not two slabs. The occupancy panels then size
 * their container from the row count (`ROW_HEIGHT` each plus the x-axis band)
 * rather than a fixed height, so the plot never floats in dead space and the axis
 * band plus legend are always inside the box.
 */
const BAR_THICKNESS = 18;
const ROW_HEIGHT = 40;
const AXIS_BAND = 56;

/** Touching marks are separated by a 2px gap in the surface colour, not by a border. */
const segmentGap = { stroke: "var(--card)", strokeWidth: 2 } as const;

const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  className: "fill-muted-foreground",
  fontSize: 12,
} as const;

type OccupancyRow = { label: string; occupied: number; available: number };

/**
 * Occupied against free for a set of named groups — sharing types, or blocks.
 *
 * Horizontal, because the group names are words ("3 sharing", "Block A") that read
 * straight across without tilting the ticks; stacked, because the pair is
 * part-to-whole and the bar's full length is that group's capacity. The tip carries
 * `occupied/total` directly, so no figure is gated behind a hover.
 */
function OccupancyBars({ rows, labelWidth }: { rows: OccupancyRow[]; labelWidth: number }) {
  const data = rows.map((r) => ({
    ...r,
    tip: `${r.occupied}/${r.occupied + r.available}`,
  }));

  return (
    <ChartContainer
      config={occupancyConfig}
      className="aspect-auto w-full"
      style={{ height: data.length * ROW_HEIGHT + AXIS_BAND }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ left: 4, right: 48, top: 4 }}
        barCategoryGap="35%"
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" allowDecimals={false} {...axisProps} />
        <YAxis type="category" dataKey="label" width={labelWidth} {...axisProps} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="occupied"
          stackId="a"
          fill="var(--color-occupied)"
          maxBarSize={BAR_THICKNESS}
          radius={[4, 0, 0, 4]}
          {...segmentGap}
        />
        <Bar
          dataKey="available"
          stackId="a"
          fill="var(--color-available)"
          maxBarSize={BAR_THICKNESS}
          radius={[0, 4, 4, 0]}
          {...segmentGap}
        >
          <LabelList
            dataKey="tip"
            position="right"
            offset={10}
            fontSize={12}
            className="fill-muted-foreground tabular-nums"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/**
 * Beds occupied against beds free for every room configuration in the property —
 * how many 2-sharing beds are open, how many 3-sharing, and what each earns.
 */
export function SharingOccupancyPanel({
  rows,
  isFlat,
}: {
  rows: DashboardData["sharingBreakdown"];
  isFlat: boolean;
}) {
  const unit = isFlat ? "flats" : "beds";

  return (
    <section className={panel}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={heading}>
          {isFlat ? "Occupancy by unit type" : "Occupancy by sharing type"}
        </h2>
        <span className="text-xs text-muted-foreground">
          {rows.reduce((n, r) => n + r.available, 0)} {unit} available
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No rooms configured for this property yet.
        </p>
      ) : (
        <>
          {/* One row is a one-bar chart — the table below already says it better. */}
          {rows.length > 1 ? (
            <OccupancyBars
              rows={rows.map((r) => ({
                label: sharingLabel(r.sharingType, isFlat),
                occupied: r.occupied,
                available: r.available,
              }))}
              labelWidth={84}
            />
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 text-right font-medium">
                    {isFlat ? "Flats" : "Rooms"}
                  </th>
                  <th className="py-2 pr-4 text-right font-medium">
                    {isFlat ? "Units" : "Beds"}
                  </th>
                  <th className="py-2 pr-4 text-right font-medium">Occupied</th>
                  <th className="py-2 pr-4 text-right font-medium">Available</th>
                  <th className="py-2 pr-4 text-right font-medium">Fill</th>
                  <th className="py-2 text-right font-medium">Rent / month</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const fill = r.beds > 0 ? Math.round((r.occupied / r.beds) * 100) : 0;
                  return (
                    <tr key={r.sharingType} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4 font-medium text-foreground">
                        {sharingLabel(r.sharingType, isFlat)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{r.rooms}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{r.beds}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{r.occupied}</td>
                      <td className="py-2 pr-4 text-right tabular-nums font-medium text-foreground">
                        {r.available}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {fill}%
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatINRCompact(r.expectedPaise)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** Occupied against free beds per block, for properties laid out in blocks. */
export function BlockOccupancyPanel({ rows }: { rows: DashboardData["blockBreakdown"] }) {
  return (
    <section className={panel}>
      <h2 className={heading}>Occupancy by block</h2>
      <OccupancyBars
        rows={rows.map((r) => ({
          label: `Block ${r.name}`,
          occupied: r.occupied,
          available: r.available,
        }))}
        labelWidth={84}
      />
    </section>
  );
}

/**
 * Rent collected against money spent, month by month, so the figures have direction.
 *
 * Grouped rather than stacked: collections and expenses are two independent
 * quantities, and the reader's job is to compare their heights within a month, not
 * to read a combined total.
 */
export function MoneyTrendPanel({ trend }: { trend: DashboardData["trend"] }) {
  // Amounts stay in paise; only the axis and tooltip formatters convert.
  const data = trend.map((t) => ({
    label: t.label,
    collected: t.collectedPaise,
    expenses: t.expensesPaise,
  }));

  return (
    <section className={panel}>
      <h2 className={heading}>Collections against expenses · last 6 months</h2>
      <ChartContainer config={moneyConfig} className="aspect-auto h-[260px] w-full">
        <BarChart
          accessibilityLayer
          data={data}
          margin={{ top: 8 }}
          barGap={2}
          barCategoryGap="30%"
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis
            width={56}
            tickFormatter={(value) => formatINRCompact(Number(value))}
            {...axisProps}
          />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent formatter={(value) => formatINR(Number(value))} />}
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            dataKey="collected"
            fill="var(--color-collected)"
            maxBarSize={26}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="expenses"
            fill="var(--color-expenses)"
            maxBarSize={26}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </section>
  );
}
