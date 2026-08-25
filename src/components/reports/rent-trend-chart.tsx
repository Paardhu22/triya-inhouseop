"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  collected: { label: "Collected (₹)", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Rent collected per month over the trailing year, ending at the reported month. */
export function RentTrendChart({
  series,
}: {
  series: { label: string; collectedPaise: number }[];
}) {
  // Stored amounts are paise; show whole rupees on the axis/tooltip.
  const data = series.map((s) => ({
    label: s.label,
    collected: Math.round(s.collectedPaise / 100),
  }));

  return (
    <ChartContainer config={chartConfig} className="h-[240px] w-full">
      <BarChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="collected" fill="var(--color-collected)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
