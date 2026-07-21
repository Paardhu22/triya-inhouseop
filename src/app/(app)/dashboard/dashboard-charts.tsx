"use client";

import * as React from "react";
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Label,
} from "recharts";

import { formatINR } from "@/lib/money";
import type { DashboardData } from "@/lib/queries/dashboard";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";

export function DashboardCharts({
  data,
  isFlat,
}: {
  data: DashboardData;
  isFlat: boolean;
}) {
  const totalUnits = isFlat ? data.totalRooms : data.totalBeds;
  const occupancyRate =
    totalUnits > 0 ? Math.round((data.occupiedBeds / totalUnits) * 100) : 0;

  // Occupancy Chart Data
  const occupancyData = [
    {
      name: "Occupied",
      value: data.occupiedBeds,
      fill: "var(--color-occupied)",
    },
    {
      name: "Vacant",
      value: data.availableBeds,
      fill: "var(--color-vacant)",
    },
  ];
  const occupancyConfig = {
    occupied: { label: "Occupied", color: "#8b5cf6" }, // Purple
    vacant: { label: "Vacant", color: "#e2e8f0" }, // Slate-200
  };

  // Payment Status Chart Data
  const paymentData = [
    { name: "Paid", value: data.paidCount, fill: "var(--color-paid)" },
    { name: "Pending", value: data.pendingCount, fill: "var(--color-pending)" },
  ];
  const paymentConfig = {
    paid: { label: "Paid", color: "#10b981" }, // Emerald
    pending: { label: "Pending", color: "#f59e0b" }, // Amber
  };

  // Financial Chart Data
  const financialData = [
    {
      name: "Current Month",
      collections: data.monthlyCollections / 100, // Passed as rupees to chart scale
      expenses: data.monthlyExpenses / 100,
    },
  ];
  const financialConfig = {
    collections: { label: "Collections", color: "#10b981" },
    expenses: { label: "Expenses", color: "#f43f5e" }, // Rose
  };

  // Capacity Breakdown Chart Data
  const breakdownData = isFlat
    ? data.blockBreakdown.map((b) => ({
        name: `Block ${b.name}`,
        occupied: b.occupied,
        vacant: b.available,
      }))
    : data.sharingBreakdown.map((s) => ({
        name: `${s.sharingType} Sharing`,
        occupied: s.occupied,
        vacant: s.available,
      }));

  const breakdownConfig = {
    occupied: { label: "Occupied", color: "#8b5cf6" },
    vacant: { label: "Vacant", color: "#cbd5e1" },
  };

  return (
    <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Total Capacity Text Card */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col justify-between">
        <div className="h-[160px] flex flex-col items-center justify-center p-6 bg-slate-500/5">
          <div className="text-5xl font-black tracking-tight text-foreground tabular-nums">
            {totalUnits}
          </div>
          <div className="text-xs font-medium text-muted-foreground mt-2 uppercase tracking-widest">
            {isFlat ? "Total Flats" : "Total Beds"}
          </div>
        </div>
        <div className="p-4 flex-1 flex flex-col justify-end bg-card">
          <div className="border-t pt-2 flex items-center justify-between text-[9px] font-mono text-muted-foreground/50">
            <span>status = &quot;active&quot;</span>
          </div>
        </div>
      </div>

      {/* 2. Occupancy Donut Chart */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col justify-between p-4">
        <div className="text-center mb-2">
          <h3 className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase">
            &gt; OCCUPANCY
          </h3>
        </div>
        <ChartContainer
          config={occupancyConfig}
          className="mx-auto aspect-square max-h-[160px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={occupancyData}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              strokeWidth={2}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-2xl font-black tabular-nums"
                        >
                          {occupancyRate}%
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </div>

      {/* 3. Payment Status Pie Chart */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col justify-between p-4">
        <div className="text-center mb-2">
          <h3 className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase">
            &gt; PAYMENTS
          </h3>
        </div>
        <ChartContainer
          config={paymentConfig}
          className="mx-auto aspect-square max-h-[160px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={paymentData}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              strokeWidth={2}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-2xl font-black tabular-nums"
                        >
                          {data.paidCount}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 16}
                          className="fill-muted-foreground text-[10px]"
                        >
                          PAID
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </div>

      {/* 4. Financials Bar Chart */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col justify-between p-4">
        <div className="text-center mb-2">
          <h3 className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase">
            &gt; FINANCIALS
          </h3>
        </div>
        <ChartContainer config={financialConfig} className="w-full h-[160px]">
          <BarChart
            data={financialData}
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              opacity={0.5}
            />
            <XAxis dataKey="name" hide />
            <YAxis hide />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.2 }}
              content={
                <ChartTooltipContent
                  formatter={(value) => formatINR(Number(value) * 100)}
                />
              }
            />
            <Bar
              dataKey="collections"
              fill="var(--color-collections)"
              radius={[4, 4, 0, 0]}
              barSize={40}
            />
            <Bar
              dataKey="expenses"
              fill="var(--color-expenses)"
              radius={[4, 4, 0, 0]}
              barSize={40}
            />
          </BarChart>
        </ChartContainer>
      </div>

      {/* 5. Capacity Breakdown Stacked Bar Chart */}
      <div className="col-span-1 sm:col-span-2 lg:col-span-4 rounded-2xl border border-border bg-card overflow-hidden shadow-sm p-6 mt-4">
        <h3 className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase mb-6">
          &gt; {isFlat ? "FLAT TYPE BREAKDOWN" : "ROOM CAPACITY BREAKDOWN"}
        </h3>
        <ChartContainer config={breakdownConfig} className="w-full h-[250px]">
          <BarChart
            data={breakdownData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              opacity={0.5}
            />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              fontSize={12}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              fontSize={12}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.2 }}
              content={<ChartTooltipContent />}
            />
            <ChartLegend content={<ChartLegendContent />} className="mt-4" />
            <Bar
              dataKey="occupied"
              stackId="a"
              fill="var(--color-occupied)"
              radius={[0, 0, 4, 4]}
              maxBarSize={60}
            />
            <Bar
              dataKey="vacant"
              stackId="a"
              fill="var(--color-vacant)"
              radius={[4, 4, 0, 0]}
              maxBarSize={60}
            />
          </BarChart>
        </ChartContainer>
      </div>
    </section>
  );
}
