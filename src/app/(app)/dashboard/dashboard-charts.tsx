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
  LabelList,
} from "recharts";

import { formatINR, formatINRCompact } from "@/lib/money";
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

  // Financial Chart Data (Collections vs Expenses side by side for current month)
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
          className="mx-auto aspect-square max-h-[160px] w-full"
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
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={70}
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
            <ChartLegend content={<ChartLegendContent />} className="mt-2 text-xs" />
          </PieChart>
        </ChartContainer>
      </div>

      {/* 3. Financials Bar Chart (Takes 2 Columns) */}
      <div className="col-span-1 sm:col-span-2 rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col justify-between p-4">
        <div className="text-center mb-2">
          <h3 className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase">
            &gt; FINANCIALS (THIS MONTH)
          </h3>
        </div>
        <ChartContainer config={financialConfig} className="w-full h-[180px]">
          <BarChart
            data={financialData}
            margin={{ top: 20, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              opacity={0.3}
            />
            <XAxis dataKey="name" hide />
            <YAxis 
              tickFormatter={(value) => formatINRCompact(value * 100)}
              tickLine={false} 
              axisLine={false} 
              tickMargin={10} 
              fontSize={11} 
              className="fill-muted-foreground"
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.1 }}
              content={
                <ChartTooltipContent
                  formatter={(value) => formatINR(Number(value) * 100)}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="collections"
              fill="var(--color-collections)"
              radius={[4, 4, 0, 0]}
              maxBarSize={60}
            >
              <LabelList 
                dataKey="collections" 
                position="top" 
                formatter={(val: any) => Number(val) > 0 ? formatINRCompact(Number(val) * 100) : ""} 
                fontSize={10} 
                className="fill-foreground font-mono font-bold"
              />
            </Bar>
            <Bar
              dataKey="expenses"
              fill="var(--color-expenses)"
              radius={[4, 4, 0, 0]}
              maxBarSize={60}
            >
              <LabelList 
                dataKey="expenses" 
                position="top" 
                formatter={(val: any) => Number(val) > 0 ? formatINRCompact(Number(val) * 100) : ""} 
                fontSize={10} 
                className="fill-foreground font-mono font-bold"
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      {/* 4. Capacity Breakdown Stacked Bar Chart */}
      <div className="col-span-1 sm:col-span-2 lg:col-span-4 rounded-2xl border border-border bg-card overflow-hidden shadow-sm p-6 mt-4">
        <h3 className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase mb-6">
          &gt; {isFlat ? "FLAT TYPE BREAKDOWN" : "ROOM CAPACITY BREAKDOWN"}
        </h3>
        <ChartContainer config={breakdownConfig} className="w-full h-[250px]">
          <BarChart
            data={breakdownData}
            margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              opacity={0.3}
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
              className="fill-muted-foreground"
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.1 }}
              content={<ChartTooltipContent />}
            />
            <ChartLegend content={<ChartLegendContent />} className="mt-4" />
            <Bar
              dataKey="occupied"
              stackId="a"
              fill="var(--color-occupied)"
              radius={[0, 0, 4, 4]}
              maxBarSize={60}
            >
               <LabelList 
                  dataKey="occupied" 
                  position="center" 
                  fill="white"
                  fontSize={11} 
                  formatter={(val: any) => Number(val) > 0 ? val : ""}
                  className="font-bold"
                />
            </Bar>
            <Bar
              dataKey="vacant"
              stackId="a"
              fill="var(--color-vacant)"
              radius={[4, 4, 0, 0]}
              maxBarSize={60}
            >
               <LabelList 
                  dataKey="vacant" 
                  position="center" 
                  fill="#475569" // slate-600 for contrast against light background
                  fontSize={11} 
                  formatter={(val: any) => Number(val) > 0 ? val : ""}
                  className="font-bold"
                />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </section>
  );
}
