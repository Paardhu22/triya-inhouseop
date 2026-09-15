"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, CircleAlert, CircleCheck, CircleMinus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { kindDef } from "@/lib/import/fields";
import type { ImportKind, ImportOptions, ImportPreview, RowStatus } from "@/lib/import/types";
import { cn } from "@/lib/utils";

/** How many rows the table renders before it stops; the counts above it are complete. */
const MAX_VISIBLE = 200;

const STATUS_META: Record<RowStatus, { label: string; className: string; icon: typeof CircleCheck }> = {
  ready: { label: "Will import", className: "text-emerald-700", icon: CircleCheck },
  skip: { label: "Skipped", className: "text-muted-foreground", icon: CircleMinus },
  error: { label: "Problem", className: "text-destructive", icon: CircleAlert },
};

function Stat({ value, label, tone }: { value: number; label: string; tone?: "good" | "bad" }) {
  return (
    <div className="space-y-1">
      <p
        className={cn(
          "text-3xl font-bold tabular-nums",
          tone === "good" && "text-emerald-700",
          tone === "bad" && value > 0 && "text-destructive",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function PreviewStep({
  kind,
  preview,
  options,
  onOptionsChange,
  propertyName,
  pending,
  onBack,
  onCommit,
}: {
  kind: ImportKind;
  preview: ImportPreview;
  options: ImportOptions;
  onOptionsChange: (options: ImportOptions) => void;
  propertyName: string;
  pending: boolean;
  onBack: () => void;
  onCommit: () => void;
}) {
  const [problemsOnly, setProblemsOnly] = useState(false);

  const visible = useMemo(() => {
    const rows = problemsOnly ? preview.rows.filter((row) => row.status !== "ready") : preview.rows;
    return { rows: rows.slice(0, MAX_VISIBLE), total: rows.length };
  }, [preview.rows, problemsOnly]);

  const toggle = (key: keyof ImportOptions) => (checked: boolean | string) =>
    onOptionsChange({ ...options, [key]: checked === true });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>What will happen</CardTitle>
          <CardDescription>
            Checked against {propertyName} as it stands right now. Nothing has been saved yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-4">
          <Stat value={preview.ready} label="Will import" tone="good" />
          <Stat value={preview.skipped} label="Already on file" />
          <Stat value={preview.errored} label="Need fixing" tone="bad" />
          <Stat value={preview.blank} label="Blank rows ignored" />
        </CardContent>
      </Card>

      {kind === "tenants" || kind === "expenses" ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Options</CardTitle>
            <CardDescription>Changing one of these re-checks the sheet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {kind === "tenants" ? (
              <>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="createMissingStructure"
                    checked={options.createMissingStructure}
                    onCheckedChange={toggle("createMissingStructure")}
                    disabled={pending}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="createMissingStructure">Create missing rooms and beds</Label>
                    <p className="text-xs text-muted-foreground">
                      Adds any floor, room or bed the sheet refers to but the property does not have
                      yet. The floor is taken from the room number unless the sheet says otherwise.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="depositIsGross"
                    checked={options.depositIsGross}
                    onCheckedChange={toggle("depositIsGross")}
                    disabled={pending}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="depositIsGross">
                      The deposit column is the full amount collected
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Holds back the ₹1,000 maintenance reserve, the same as a move-in through Floor
                      Manager. Untick this if your sheet already records the deposit net of it.
                    </p>
                  </div>
                </div>
              </>
            ) : null}
            {kind === "expenses" ? (
              <div className="flex items-start gap-3">
                <Checkbox
                  id="createMissingCategories"
                  checked={options.createMissingCategories}
                  onCheckedChange={toggle("createMissingCategories")}
                  disabled={pending}
                />
                <div className="space-y-1">
                  <Label htmlFor="createMissingCategories">Create missing categories</Label>
                  <p className="text-xs text-muted-foreground">
                    Adds any expense category or subcategory named in the sheet that this property has
                    not defined yet.
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="border-b sm:grid-cols-[1fr_auto]">
          <div>
            <CardTitle>Row by row</CardTitle>
            <CardDescription>
              {kindDef(kind).rowMeaning} Row numbers match your spreadsheet, heading row included.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="problemsOnly"
              checked={problemsOnly}
              onCheckedChange={(checked) => setProblemsOnly(checked === true)}
            />
            <Label htmlFor="problemsOnly" className="text-sm font-normal">
              Show only rows needing attention
            </Label>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visible.rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {problemsOnly ? "Every row is ready to import." : "There is nothing to show."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead className="w-32">Outcome</TableHead>
                    <TableHead className="w-[30%]">From your sheet</TableHead>
                    <TableHead>What happens</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.rows.map((row) => {
                    const meta = STATUS_META[row.status];
                    const Icon = meta.icon;
                    return (
                      <TableRow key={row.rowNumber}>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {row.rowNumber}
                        </TableCell>
                        <TableCell>
                          <span className={cn("flex items-center gap-1.5 text-xs", meta.className)}>
                            <Icon className="size-3.5 shrink-0" />
                            {meta.label}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell
                          className={cn("text-sm", row.status === "error" && "text-destructive")}
                        >
                          {row.message}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {visible.total > visible.rows.length ? (
                <p className="border-t p-3 text-xs text-muted-foreground">
                  Showing the first {visible.rows.length} of {visible.total} rows. The counts above
                  cover every row.
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          <ArrowLeft className="size-4" /> Back to columns
        </Button>
        <div className="flex items-center gap-3">
          {preview.errored > 0 ? (
            <Badge variant="outline" className="h-auto py-1 font-normal">
              {preview.errored} row{preview.errored === 1 ? "" : "s"} will be left out
            </Badge>
          ) : null}
          <Button type="button" disabled={pending || preview.ready === 0} onClick={onCommit}>
            {pending
              ? "Importing…"
              : preview.ready === 0
                ? "Nothing to import"
                : `Import ${preview.ready} row${preview.ready === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
