"use client";

import { useMemo } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { missingRequirements } from "@/lib/import/auto-map";
import { IMPORT_KIND_DEFS, kindDef } from "@/lib/import/fields";
import { IMPORT_KINDS, type ColumnMapping, type ImportKind, type ParsedUpload } from "@/lib/import/types";
import { previewCell } from "@/lib/import/validate";
import { cn } from "@/lib/utils";

const SKIP = "__skip__";

export function MappingStep({
  upload,
  sheetIndex,
  onSheetChange,
  kind,
  onKindChange,
  mapping,
  onMappingChange,
  isFlat,
  pending,
  onBack,
  onContinue,
}: {
  upload: ParsedUpload;
  sheetIndex: number;
  onSheetChange: (index: number) => void;
  kind: ImportKind;
  onKindChange: (kind: ImportKind) => void;
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  isFlat: boolean;
  pending: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const sheet = upload.sheets[sheetIndex];
  const def = kindDef(kind);
  const missing = useMemo(() => missingRequirements(kind, mapping), [kind, mapping]);
  const sample = sheet.rows[0] ?? [];

  const setColumn = (fieldKey: string, value: string) => {
    const next = { ...mapping };
    if (value === SKIP) {
      delete next[fieldKey];
    } else {
      const column = Number(value);
      // A column can only feed one field, so claiming it releases it from any other.
      for (const [key, index] of Object.entries(next)) {
        if (index === column && key !== fieldKey) delete next[key];
      }
      next[fieldKey] = column;
    }
    onMappingChange(next);
  };

  const mappedCount = Object.keys(mapping).length;

  return (
    <div className="space-y-5">
      <Card variant="section">
        <CardHeader className="border-b sm:grid-cols-[1fr_auto]">
          <div>
            <CardTitle>What is in this sheet?</CardTitle>
            <CardDescription>
              {upload.sourceName} · {sheet.rows.length} row{sheet.rows.length === 1 ? "" : "s"} ·{" "}
              {sheet.headers.length} column{sheet.headers.length === 1 ? "" : "s"}
              {sheet.truncated > 0 ? ` · ${sheet.truncated} further rows were not read` : ""}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {upload.sheets.length > 1 ? (
              <Select value={String(sheetIndex)} onValueChange={(value) => onSheetChange(Number(value))}>
                <SelectTrigger className="w-full sm:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {upload.sheets.map((item, index) => (
                    <SelectItem key={item.name} value={String(index)}>
                      {item.name} ({item.rows.length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select value={kind} onValueChange={(value) => onKindChange(value as ImportKind)}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPORT_KINDS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {IMPORT_KIND_DEFS[item].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{def.rowMeaning}</p>
        </CardContent>
      </Card>

      <Card variant="section">
        <CardHeader className="border-b">
          <CardTitle>Match your columns</CardTitle>
          <CardDescription>
            {mappedCount} of your {sheet.headers.length} columns are matched. Anything left as
            &ldquo;Not imported&rdquo; is ignored. Dates written as numbers are read day-first, so
            01/06/2024 is 1 June.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[34%]">Triya field</TableHead>
                  <TableHead className="w-[33%]">Your column</TableHead>
                  <TableHead className="w-[33%]">First row reads as</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {def.fields.map((field) => {
                  const column = mapping[field.key];
                  const raw = column === undefined ? "" : (sample[column] ?? "");
                  const read = column === undefined ? null : previewCell(kind, field.key, raw);
                  return (
                    <TableRow key={field.key}>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{field.label}</span>
                          {field.required ? (
                            <Badge variant="secondary" className="font-normal">
                              Required
                            </Badge>
                          ) : null}
                        </div>
                        {field.hint ? (
                          <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top">
                        <Select
                          value={column === undefined ? SKIP : String(column)}
                          onValueChange={(value) => setColumn(field.key, value)}
                        >
                          <SelectTrigger
                            className={cn(
                              "w-full",
                              field.required && column === undefined && "border-destructive",
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SKIP}>Not imported</SelectItem>
                            {sheet.headers.map((header, index) => (
                              <SelectItem key={`${header}-${index}`} value={String(index)}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="align-top">
                        {read === null ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={cn(
                              "text-xs",
                              read.ok ? "text-foreground" : "text-destructive",
                            )}
                          >
                            {read.text}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {missing.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            Still needed before this sheet can be checked: {missing.join(", ")}.
            {isFlat && kind === "tenants" ? " This property rents whole flats, so the room number is the flat number." : ""}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" /> Choose a different file
        </Button>
        <Button type="button" disabled={pending || missing.length > 0} onClick={onContinue}>
          {pending ? "Checking…" : "Check the sheet"}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
