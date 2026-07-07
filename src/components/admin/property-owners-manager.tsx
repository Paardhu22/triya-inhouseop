"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Power, PowerOff, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  assignPropertyToOwner,
  createPropertyOwner,
  setPropertyOwnerActive,
  unassignPropertyFromOwner,
} from "@/lib/actions/property-owners";
import type { PropertyOwnerRow } from "@/lib/queries/property-owners";
import type { AdminPropertyRow } from "@/lib/queries/properties";

export function PropertyOwnersManager({
  owners,
  properties,
}: {
  owners: PropertyOwnerRow[];
  properties: AdminPropertyRow[];
}) {
  return (
    <Card>
      <CardHeader className="border-b sm:grid-cols-[1fr_auto]">
        <div>
          <CardTitle>Property owners</CardTitle>
          <CardDescription>
            Create a Property Owner login and assign it the properties they own.
          </CardDescription>
        </div>
        <AddOwnerDialog properties={properties} />
      </CardHeader>
      <CardContent className="divide-y py-0">
        {owners.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No property owners yet.</p>
        ) : (
          owners.map((owner) => (
            <OwnerRow key={owner.id} owner={owner} properties={properties} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function OwnerRow({
  owner,
  properties,
}: {
  owner: PropertyOwnerRow;
  properties: AdminPropertyRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const assignedIds = new Set(owner.ownedProperties.map((o) => o.property.id));
  const available = properties.filter((p) => !assignedIds.has(p.id));

  function toggleActive() {
    startTransition(async () => {
      const res = await setPropertyOwnerActive({ userId: owner.id, active: !owner.isActive });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(owner.isActive ? "Owner deactivated" : "Owner reactivated");
      router.refresh();
    });
  }

  function assign(propertyId: string) {
    startTransition(async () => {
      const res = await assignPropertyToOwner({ userId: owner.id, propertyId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function unassign(propertyId: string) {
    startTransition(async () => {
      const res = await unassignPropertyFromOwner({ userId: owner.id, propertyId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-3 first:pt-4 last:pb-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{owner.name}</p>
          {!owner.isActive ? <Badge variant="secondary">Inactive</Badge> : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">{owner.email}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {owner.ownedProperties.map(({ property }) => (
            <Badge key={property.id} variant="outline" className="gap-1 pr-1">
              {property.name}
              <button
                type="button"
                onClick={() => unassign(property.id)}
                disabled={pending}
                className="rounded-full p-0.5 hover:bg-muted"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {available.length > 0 ? (
            <Select onValueChange={assign} disabled={pending}>
              <SelectTrigger className="h-6 w-auto gap-1 border-dashed px-2 text-xs">
                <SelectValue placeholder="+ Add property" />
              </SelectTrigger>
              <SelectContent>
                {available.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>
      <Button variant="outline" size="sm" disabled={pending} onClick={toggleActive}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : owner.isActive ? (
          <PowerOff className="size-4" />
        ) : (
          <Power className="size-4" />
        )}
        {owner.isActive ? "Deactivate" : "Reactivate"}
      </Button>
    </div>
  );
}

function AddOwnerDialog({ properties }: { properties: AdminPropertyRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await createPropertyOwner({
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        password: String(formData.get("password") ?? ""),
        propertyIds: selected,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Property owner created and credentials sent over WhatsApp");
      setOpen(false);
      setSelected([]);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add owner
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a property owner</DialogTitle>
          <DialogDescription>
            Creates their login and sends the email/password to their WhatsApp. They
            create their own properties after signing in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="owner-name">Name</Label>
            <Input id="owner-name" name="name" maxLength={120} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-email">Email</Label>
            <Input id="owner-email" name="email" type="email" maxLength={160} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-phone">WhatsApp number</Label>
            <Input id="owner-phone" name="phone" type="tel" maxLength={20} placeholder="10-digit mobile number" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-password">Password</Label>
            <Input
              id="owner-password"
              name="password"
              type="text"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
            />
          </div>
          {properties.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Properties (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {properties.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      selected.includes(p.id) ? "border-primary bg-primary/10" : "border-input"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
