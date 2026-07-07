"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { createOwnComplaint } from "@/lib/actions/complaints";

export function FileComplaintForm() {
  const router = useRouter();
  const [priority, setPriority] = useState("MEDIUM");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await createOwnComplaint({
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        priority,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Complaint submitted");
      (event.target as HTMLFormElement).reset();
      setPriority("MEDIUM");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1.5">
        <Label htmlFor="complaint-title">Title</Label>
        <Input id="complaint-title" name="title" maxLength={160} required placeholder="e.g. Leaking tap in bathroom" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="complaint-description">Description</Label>
        <Textarea id="complaint-description" name="description" maxLength={2000} rows={4} placeholder="Optional details" />
      </div>
      <div className="space-y-1.5">
        <Label>Priority</Label>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Submit complaint
      </Button>
    </form>
  );
}
