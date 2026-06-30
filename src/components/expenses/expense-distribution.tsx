"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatINR } from "@/lib/money";

type Slice = { name: string; total: number };

function RankedBars({ data }: { data: Slice[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">No spending recorded this year.</p>
    );
  }
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <ul className="space-y-3">
      {data.slice(0, 8).map((d) => (
        <li key={d.name} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-foreground">{d.name}</span>
            <span className="shrink-0 font-medium tabular-nums">{formatINR(d.total)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/70 transition-[width] duration-500"
              style={{ width: `${Math.max(2, (d.total / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ExpenseDistribution({
  categories,
  subcategories,
}: {
  categories: Slice[];
  subcategories: Slice[];
}) {
  return (
    <Tabs defaultValue="categories" className="gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Distribution
        </h2>
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="subcategories">Subcategories</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="categories">
        <RankedBars data={categories} />
      </TabsContent>
      <TabsContent value="subcategories">
        <RankedBars data={subcategories} />
      </TabsContent>
    </Tabs>
  );
}
