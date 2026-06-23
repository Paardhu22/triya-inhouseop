"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Check, MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateComplaint } from "@/lib/actions/complaints";
import type { AssignableUser, ComplaintListItem } from "@/lib/queries/complaints";
import { COMPLAINT_PRIORITY_META, COMPLAINT_STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ComplaintStatus } from "@/generated/prisma/client";
import { ComplaintFormDialog } from "./complaint-form-dialog";

const STATUSES: ComplaintStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED"];

export function ComplaintsClient({
  complaints,
  users,
}: {
  complaints: ComplaintListItem[];
  users: AssignableUser[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return complaints.filter((c) => {
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      if (priorityFilter !== "ALL" && c.priority !== priorityFilter) return false;
      if (query) {
        const haystack = `${c.title} ${c.assignedTo?.name ?? ""} ${c.room?.number ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [complaints, q, statusFilter, priorityFilter]);

  function patch(
    id: string,
    data: Parameters<typeof updateComplaint>[1],
  ) {
    startTransition(async () => {
      const res = await updateComplaint(id, data);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Complaint updated");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search complaints"
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All priorities</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <ComplaintFormDialog users={users} />
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Complaint</TableHead>
              <TableHead className="w-28">Priority</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-40">Assignee</TableHead>
              <TableHead className="w-24">Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  No complaints match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.title}</div>
                    {c.description ? (
                      <div className="line-clamp-1 text-xs text-muted-foreground">
                        {c.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge meta={COMPLAINT_PRIORITY_META[c.priority]} dot />
                  </TableCell>
                  <TableCell>
                    <StatusBadge meta={COMPLAINT_STATUS_META[c.status]} dot />
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.assignedTo?.name ?? (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(c.createdAt, "dd MMM")}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={pending}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                          Set status
                        </DropdownMenuLabel>
                        {STATUSES.map((s) => (
                          <DropdownMenuItem key={s} onSelect={() => patch(c.id, { status: s })}>
                            {COMPLAINT_STATUS_META[s].label}
                            {c.status === s ? <Check className="ml-auto size-4" /> : null}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>Assign to</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem
                              onSelect={() => patch(c.id, { assignedToId: null })}
                            >
                              Unassigned
                              {!c.assignedTo ? <Check className="ml-auto size-4" /> : null}
                            </DropdownMenuItem>
                            {users.map((u) => (
                              <DropdownMenuItem
                                key={u.id}
                                onSelect={() => patch(c.id, { assignedToId: u.id })}
                              >
                                {u.name}
                                {c.assignedTo?.id === u.id ? (
                                  <Check className="ml-auto size-4" />
                                ) : null}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className={cn("text-xs text-muted-foreground", pending && "opacity-60")}>
        {filtered.length} of {complaints.length} complaints
      </p>
    </div>
  );
}
