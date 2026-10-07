"use client";

import Link from "next/link";
import { CircleCheck, Download, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { problemsCsv } from "@/lib/import/template";
import type { ImportKind, ImportSummary } from "@/lib/import/types";

/** Where it makes sense to go and look at what was just imported. */
const NEXT_STOP: Record<ImportKind, { href: string; label: string }> = {
  tenants: { href: "/floor-manager", label: "Open Floor Manager" },
  structure: { href: "/admin", label: "Open Admin" },
  payments: { href: "/collections", label: "Open Collections" },
  expenses: { href: "/expenses", label: "Open Expense Tracker" },
};

export function ResultStep({
  kind,
  summary,
  propertyName,
  onRestart,
}: {
  kind: ImportKind;
  summary: ImportSummary;
  propertyName: string;
  onRestart: () => void;
}) {
  const next = NEXT_STOP[kind];

  const downloadProblems = () => {
    const blob = new Blob([`﻿${problemsCsv(summary.problems)}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "triya-import-problems.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <Card variant="section">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <CircleCheck className="size-5 text-emerald-700" />
            {summary.imported > 0 ? "Import finished" : "Nothing new to import"}
          </CardTitle>
          <CardDescription>
            {summary.imported > 0
              ? `${summary.imported} row${summary.imported === 1 ? "" : "s"} written to ${propertyName}.`
              : `Every row was either already on file or could not be read, so ${propertyName} is unchanged.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {summary.created.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-4">
              {summary.created.map((entry) => (
                <div key={entry.label} className="space-y-1">
                  <p className="text-3xl font-bold tabular-nums">{entry.count}</p>
                  <p className="text-xs text-muted-foreground">{entry.label}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link href={next.href}>{next.label}</Link>
            </Button>
            <Button type="button" variant="outline" onClick={onRestart}>
              <RotateCcw className="size-4" /> Import something else
            </Button>
            {summary.problems.length > 0 ? (
              <Button type="button" variant="ghost" onClick={downloadProblems}>
                <Download className="size-4" /> Download the {summary.problems.length} row
                {summary.problems.length === 1 ? "" : "s"} left out
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {summary.problems.length > 0 ? (
        <Card variant="section">
          <CardHeader className="border-b">
            <CardTitle>Rows that were left out</CardTitle>
            <CardDescription>
              {summary.skipped} already on file, {summary.failed} could not be read. Fix these in your
              spreadsheet and import again — the rows that did land will be recognised and skipped.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead className="w-[30%]">From your sheet</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.problems.slice(0, 100).map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {row.rowNumber}
                      </TableCell>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className={row.status === "error" ? "text-destructive" : undefined}>
                        {row.message}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {summary.problems.length > 100 ? (
                <p className="border-t p-3 text-xs text-muted-foreground">
                  Showing the first 100. Download the CSV for the rest.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
