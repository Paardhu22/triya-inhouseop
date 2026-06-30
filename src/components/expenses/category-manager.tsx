"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ActionResult } from "@/lib/action-result";
import {
  createCategory,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
  renameCategory,
  renameSubcategory,
} from "@/lib/actions/expense-categories";
import { formatINR } from "@/lib/money";
import type { CategoryWithStats } from "@/lib/queries/expense-categories";

export function CategoryManager({ categories }: { categories: CategoryWithStats[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [newCategory, setNewCategory] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [newSub, setNewSub] = useState("");

  function run(action: () => Promise<ActionResult>, onDone?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved");
      onDone?.();
      router.refresh();
    });
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <FolderTree className="size-4" />
          Manage categories
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Manage categories</SheetTitle>
          <SheetDescription>
            Organise expenses by category and subcategory. Categories in use can&apos;t be deleted.
          </SheetDescription>
        </SheetHeader>

        {/* Add category */}
        <div className="flex items-center gap-2 border-b p-4">
          <Input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="New category name"
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCategory.trim()) {
                e.preventDefault();
                run(() => createCategory({ name: newCategory }), () => setNewCategory(""));
              }
            }}
          />
          <Button
            size="icon"
            disabled={pending || !newCategory.trim()}
            onClick={() => run(() => createCategory({ name: newCategory }), () => setNewCategory(""))}
            aria-label="Add category"
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {categories.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No categories yet. Add your first one above.
            </div>
          ) : (
            <div className="divide-y">
              {categories.map((c) => {
                const isOpen = expanded.has(c.id);
                const isEditing = editing?.id === c.id;
                return (
                  <div key={c.id} className="px-2 py-1.5">
                    {/* Category row */}
                    <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-muted/50">
                      <button
                        type="button"
                        onClick={() => toggle(c.id)}
                        className="text-muted-foreground"
                        aria-label={isOpen ? "Collapse" : "Expand"}
                      >
                        {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>

                      {isEditing ? (
                        <RenameRow
                          value={editing.value}
                          pending={pending}
                          onChange={(v) => setEditing({ id: c.id, value: v })}
                          onCancel={() => setEditing(null)}
                          onSave={() =>
                            run(() => renameCategory({ id: c.id, name: editing.value }), () =>
                              setEditing(null),
                            )
                          }
                        />
                      ) : (
                        <>
                          <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                          <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                            {formatINR(c.total)}
                            {c.count > 0 ? ` · ${c.count}` : ""}
                          </span>
                          <RowActions
                            pending={pending}
                            onEdit={() => setEditing({ id: c.id, value: c.name })}
                            deleteTitle={`Delete "${c.name}"?`}
                            deleteDescription={
                              c.count > 0
                                ? `This category has ${c.count} expense${c.count === 1 ? "" : "s"} and can't be deleted until they're removed.`
                                : "This also removes its subcategories. This cannot be undone."
                            }
                            onDelete={() => run(() => deleteCategory({ id: c.id }))}
                          />
                        </>
                      )}
                    </div>

                    {/* Subcategories */}
                    {isOpen ? (
                      <div className="ml-6 space-y-0.5 border-l pl-3 pb-1">
                        {c.subcategories.map((s) => {
                          const subEditing = editing?.id === s.id;
                          return (
                            <div
                              key={s.id}
                              className="group flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted/50"
                            >
                              {subEditing ? (
                                <RenameRow
                                  value={editing.value}
                                  pending={pending}
                                  onChange={(v) => setEditing({ id: s.id, value: v })}
                                  onCancel={() => setEditing(null)}
                                  onSave={() =>
                                    run(() => renameSubcategory({ id: s.id, name: editing.value }), () =>
                                      setEditing(null),
                                    )
                                  }
                                />
                              ) : (
                                <>
                                  <span className="flex-1 truncate text-sm">{s.name}</span>
                                  <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                                    {formatINR(s.total)}
                                    {s.count > 0 ? ` · ${s.count}` : ""}
                                  </span>
                                  <RowActions
                                    pending={pending}
                                    onEdit={() => setEditing({ id: s.id, value: s.name })}
                                    deleteTitle={`Delete "${s.name}"?`}
                                    deleteDescription={
                                      s.count > 0
                                        ? `This subcategory has ${s.count} expense${s.count === 1 ? "" : "s"} and can't be deleted until they're removed.`
                                        : "This cannot be undone."
                                    }
                                    onDelete={() => run(() => deleteSubcategory({ id: s.id }))}
                                  />
                                </>
                              )}
                            </div>
                          );
                        })}

                        {/* Add subcategory */}
                        {addingSubFor === c.id ? (
                          <div className="flex items-center gap-1 px-2 py-1">
                            <Input
                              autoFocus
                              value={newSub}
                              onChange={(e) => setNewSub(e.target.value)}
                              placeholder="New subcategory"
                              disabled={pending}
                              className="h-8"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newSub.trim()) {
                                  e.preventDefault();
                                  run(
                                    () => createSubcategory({ categoryId: c.id, name: newSub }),
                                    () => setNewSub(""),
                                  );
                                }
                                if (e.key === "Escape") {
                                  setAddingSubFor(null);
                                  setNewSub("");
                                }
                              }}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              disabled={pending || !newSub.trim()}
                              onClick={() =>
                                run(
                                  () => createSubcategory({ categoryId: c.id, name: newSub }),
                                  () => setNewSub(""),
                                )
                              }
                              aria-label="Save subcategory"
                            >
                              <Check className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              onClick={() => {
                                setAddingSubFor(null);
                                setNewSub("");
                              }}
                              aria-label="Cancel"
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setAddingSubFor(c.id);
                              setNewSub("");
                            }}
                            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Plus className="size-3.5" />
                            Add subcategory
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function RenameRow({
  value,
  pending,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  pending: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-1 items-center gap-1">
      <Input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        className="h-8"
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            e.preventDefault();
            onSave();
          }
          if (e.key === "Escape") onCancel();
        }}
      />
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        disabled={pending || !value.trim()}
        onClick={onSave}
        aria-label="Save"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      </Button>
      <Button size="icon" variant="ghost" className="size-8" onClick={onCancel} aria-label="Cancel">
        <X className="size-4" />
      </Button>
    </div>
  );
}

function RowActions({
  pending,
  onEdit,
  onDelete,
  deleteTitle,
  deleteDescription,
}: {
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  deleteTitle: string;
  deleteDescription: string;
}) {
  return (
    <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <Button
        size="icon"
        variant="ghost"
        className="size-8 text-muted-foreground"
        onClick={onEdit}
        disabled={pending}
        aria-label="Rename"
      >
        <Pencil className="size-3.5" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground"
            disabled={pending}
            aria-label="Delete"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
