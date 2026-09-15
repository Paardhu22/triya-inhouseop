"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { commitImportRows, previewImportRows } from "@/lib/actions/import";
import { suggestMapping } from "@/lib/import/auto-map";
import {
  DEFAULT_IMPORT_OPTIONS,
  type ColumnMapping,
  type ImportKind,
  type ImportOptions,
  type ImportPreview,
  type ImportSummary,
  type ParsedUpload,
} from "@/lib/import/types";

import { MappingStep } from "./mapping-step";
import { PreviewStep } from "./preview-step";
import { ResultStep } from "./result-step";
import { SourceStep } from "./source-step";

type Stage = "source" | "map" | "preview" | "done";

const STAGES: { id: Stage; label: string }[] = [
  { id: "source", label: "Choose data" },
  { id: "map", label: "Match columns" },
  { id: "preview", label: "Check" },
  { id: "done", label: "Import" },
];

/**
 * The import wizard. Holds the sheet in memory and walks the user through choosing it,
 * matching its columns to our fields, checking what would happen, and committing.
 *
 * Column guessing runs here in the browser (src/lib/import/auto-map.ts is pure), but
 * the verdict on any given row always comes from the server, which re-validates the
 * raw cells rather than trusting anything this component decided.
 */
export function ImportClient({ propertyName, isFlat }: { propertyName: string; isFlat: boolean }) {
  const [stage, setStage] = useState<Stage>("source");
  const [upload, setUpload] = useState<ParsedUpload | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [kind, setKind] = useState<ImportKind>("tenants");
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [pending, startTransition] = useTransition();

  const sheet = upload?.sheets[sheetIndex] ?? null;

  const runInput = useMemo(
    () => (sheet ? { kind, mapping, rows: sheet.rows, firstDataRow: sheet.firstDataRow, options } : null),
    [sheet, kind, mapping, options],
  );

  const handleParsed = useCallback((parsed: ParsedUpload) => {
    const first = parsed.sheets.findIndex((item) => item.rows.length > 0);
    const index = first === -1 ? 0 : first;
    setUpload(parsed);
    setSheetIndex(index);
    setKind(parsed.suggestedKind);
    setMapping(suggestMapping(parsed.suggestedKind, parsed.sheets[index].headers));
    setPreview(null);
    setSummary(null);
    setStage("map");
  }, []);

  /** Re-guess the mapping whenever the sheet or its type changes under the user. */
  const handleSheetChange = useCallback(
    (index: number) => {
      if (!upload) return;
      setSheetIndex(index);
      setMapping(suggestMapping(kind, upload.sheets[index].headers));
      setPreview(null);
    },
    [upload, kind],
  );

  const handleKindChange = useCallback(
    (next: ImportKind) => {
      setKind(next);
      if (sheet) setMapping(suggestMapping(next, sheet.headers));
      setPreview(null);
    },
    [sheet],
  );

  const runPreview = useCallback(
    (nextOptions?: ImportOptions) => {
      if (!sheet) return;
      const input = {
        kind,
        mapping,
        rows: sheet.rows,
        firstDataRow: sheet.firstDataRow,
        options: nextOptions ?? options,
      };
      startTransition(async () => {
        const result = await previewImportRows(input);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setPreview(result.data);
        setStage("preview");
      });
    },
    [sheet, kind, mapping, options],
  );

  const handleOptionsChange = useCallback(
    (next: ImportOptions) => {
      setOptions(next);
      runPreview(next);
    },
    [runPreview],
  );

  const runCommit = useCallback(() => {
    if (!runInput) return;
    startTransition(async () => {
      const result = await commitImportRows(runInput);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSummary(result.data);
      setStage("done");
      toast.success(
        result.data.imported > 0
          ? `Imported ${result.data.imported} row${result.data.imported === 1 ? "" : "s"}`
          : "Nothing new to import",
      );
    });
  }, [runInput]);

  const restart = useCallback(() => {
    setUpload(null);
    setSheetIndex(0);
    setMapping({});
    setOptions(DEFAULT_IMPORT_OPTIONS);
    setPreview(null);
    setSummary(null);
    setStage("source");
  }, []);

  const activeIndex = STAGES.findIndex((item) => item.id === stage);

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
        {STAGES.map((item, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li key={item.id} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
                  active && "border-primary bg-primary text-primary-foreground",
                  done && "border-primary/40 bg-primary/10 text-primary",
                  !active && !done && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className={cn(active ? "font-medium text-foreground" : "text-muted-foreground")}>
                {item.label}
              </span>
              {index < STAGES.length - 1 ? <span className="mx-1 h-px w-6 bg-border" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>

      {stage === "source" ? <SourceStep onParsed={handleParsed} /> : null}

      {stage === "map" && upload && sheet ? (
        <MappingStep
          upload={upload}
          sheetIndex={sheetIndex}
          onSheetChange={handleSheetChange}
          kind={kind}
          onKindChange={handleKindChange}
          mapping={mapping}
          onMappingChange={setMapping}
          isFlat={isFlat}
          pending={pending}
          onBack={restart}
          onContinue={() => runPreview()}
        />
      ) : null}

      {stage === "preview" && preview && sheet ? (
        <PreviewStep
          kind={kind}
          preview={preview}
          options={options}
          onOptionsChange={handleOptionsChange}
          propertyName={propertyName}
          pending={pending}
          onBack={() => setStage("map")}
          onCommit={runCommit}
        />
      ) : null}

      {stage === "done" && summary ? (
        <ResultStep kind={kind} summary={summary} propertyName={propertyName} onRestart={restart} />
      ) : null}
    </div>
  );
}
