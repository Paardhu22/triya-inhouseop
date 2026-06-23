"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  total: { label: "Expenses (₹)", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function ExpenseChart({ series }: { series: { label: string; total: number }[] }) {
  // Stored amounts are paise; show whole rupees on the axis/tooltip.
  const data = series.map((s) => ({ label: s.label, total: Math.round(s.total / 100) }));

  return (
    <ChartContainer config={chartConfig} className="h-[240px] w-full">
      <BarChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
