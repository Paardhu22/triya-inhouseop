"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Layers3, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createBlock, createFloorFromTemplate, createFloorTemplate } from "@/lib/actions/admin";
import type { AdminPropertyConfig } from "@/lib/queries/admin";

export function PropertyStructureActions({ config }: { config: AdminPropertyConfig }) {
  return (
    <div className="flex flex-wrap gap-2">
      <CreateTemplateDialog />
      {config.hasBlocks ? <CreateBlockDialog /> : null}
      <CreateFloorDialog config={config} />
    </div>
  );
}

function CreateTemplateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const sharingTypes = String(form.get("sharingTypes") ?? "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    startTransition(async () => {
      const result = await createFloorTemplate({
        name: form.get("name"),
        description: form.get("description"),
        sharingTypes,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Floor template created");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Layers3 className="size-4" />New template</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New floor template</DialogTitle>
          <DialogDescription>Define the reusable room capacities for one floor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Name</Label>
            <Input id="template-name" name="name" required maxLength={100} placeholder="Standard residential floor" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sharing-types">Room sharing layout</Label>
            <Input id="sharing-types" name="sharingTypes" required placeholder="2, 2, 3, 3, 1" />
            <p className="text-xs text-muted-foreground">One capacity per room, in room order.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="template-description">Description</Label>
            <Textarea id="template-description" name="description" rows={2} maxLength={500} />
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}Create template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateBlockDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createBlock({ name: form.get("name") });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Block created");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Building2 className="size-4" />New block</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New block</DialogTitle>
          <DialogDescription>Add another building block to this property.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="block-name">Block name</Label>
            <Input id="block-name" name="name" required maxLength={30} placeholder="C" />
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}Create block
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateFloorDialog({ config }: { config: AdminPropertyConfig }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState(config.floorTemplates[0]?.id ?? "");
  const [blockId, setBlockId] = useState(config.blocks[0]?.id ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createFloorFromTemplate({
        templateId,
        blockId: config.hasBlocks ? blockId : "",
        number: form.get("number"),
        name: form.get("name"),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Floor created from template");
      setOpen(false);
      router.refresh();
    });
  }

  const disabled = config.floorTemplates.length === 0 || (config.hasBlocks && config.blocks.length === 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}><Plus className="size-4" />Add floor</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add floor</DialogTitle>
          <DialogDescription>Instantiate rooms and beds from a reusable template.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {config.hasBlocks ? (
            <div className="space-y-1.5">
              <Label>Block</Label>
              <Select value={blockId} onValueChange={setBlockId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {config.blocks.map((block) => <SelectItem key={block.id} value={block.id}>Block {block.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {config.floorTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="floor-number">Floor number</Label>
              <Input id="floor-number" name="number" type="number" min={0} max={999} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="floor-name">Display name</Label>
              <Input id="floor-name" name="name" maxLength={100} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={pending || disabled}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}Create floor
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
