"use client";

import { useRef, useState, useTransition } from "react";
import { ClipboardPaste, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { parseImportUpload } from "@/lib/actions/import";
import { IMPORT_KIND_DEFS } from "@/lib/import/fields";
import { IMPORT_KINDS, type ParsedUpload } from "@/lib/import/types";
import { cn } from "@/lib/utils";

const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xlsm";

export function SourceStep({ onParsed }: { onParsed: (upload: ParsedUpload) => void }) {
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const send = (formData: FormData) => {
    startTransition(async () => {
      const result = await parseImportUpload(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onParsed(result.data);
    });
  };

  const sendFile = (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    send(formData);
  };

  const sendPasted = () => {
    if (!pasted.trim()) {
      toast.error("Paste some rows first");
      return;
    }
    const formData = new FormData();
    formData.append("text", pasted);
    send(formData);
  };

  return (
    <div className="space-y-5">
      <Card variant="section">
        <CardHeader className="border-b">
          <CardTitle>Where is the data?</CardTitle>
          <CardDescription>
            Nothing is saved at this stage — the file is only read so you can match up its columns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="file">
            <TabsList>
              <TabsTrigger value="file">
                <Upload className="size-4" /> Upload a file
              </TabsTrigger>
              <TabsTrigger value="paste">
                <ClipboardPaste className="size-4" /> Paste from Excel
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="pt-4">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) sendFile(file);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center transition-colors",
                  dragging ? "border-primary bg-primary/5" : "border-border bg-muted/20",
                )}
              >
                <FileSpreadsheet className="size-8 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Drop a spreadsheet here</p>
                  <p className="text-xs text-muted-foreground">
                    CSV, TSV or Excel (.xlsx), up to 5 MB
                  </p>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) sendFile(file);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => inputRef.current?.click()}
                >
                  {pending ? "Reading…" : "Choose a file"}
                </Button>
                <p className="max-w-md text-xs text-muted-foreground">
                  Working from an old <code className="font-mono">.xls</code>? Open it in Excel and use
                  Save As to make a <code className="font-mono">.xlsx</code> or CSV first.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="paste" className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">
                Select the cells in Excel or Google Sheets — including the heading row — copy them, and
                paste below.
              </p>
              <Textarea
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                rows={10}
                spellCheck={false}
                placeholder={"Name\tPhone\tRoom\tRent\tJoining Date\nAnanya Rao\t9876543210\t301\t8500\t01/06/2024"}
                className="font-mono text-xs"
              />
              <Button type="button" disabled={pending} onClick={sendPasted}>
                {pending ? "Reading…" : "Read pasted rows"}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card variant="section">
        <CardHeader className="border-b">
          <CardTitle>What can be imported</CardTitle>
          <CardDescription>
            Your columns can be named anything — you match them up in the next step. Download a
            template if you would rather start from our layout.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {IMPORT_KINDS.map((kind) => {
            const def = IMPORT_KIND_DEFS[kind];
            return (
              <div key={kind} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="font-medium">{def.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{def.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{def.rowMeaning}</p>
                </div>
                <Button asChild variant="ghost" size="sm" className="mt-auto w-fit">
                  <a href={`/api/import/template?kind=${kind}`}>
                    <Download className="size-4" /> Template CSV
                  </a>
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
