"use client";

import { FormEvent, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword, updatePropertySettings } from "@/lib/actions/settings";
import { cn } from "@/lib/utils";

type Props = {
  user: { name: string | null; email: string | null; role: string };
  property: { name: string; slug: string; address: string | null; city: string | null };
  canManageProperty: boolean;
};

export function SettingsClient({ user, property, canManageProperty }: Props) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <AccountCard user={user} />
      <PasswordCard />
      <PropertyCard property={property} canManage={canManageProperty} />
    </div>
  );
}

function AccountCard({ user }: Pick<Props, "user">) {
  return (
    <Card>
      <CardHeader><CardTitle>Account</CardTitle><CardDescription>Your authenticated staff identity and access level.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <ReadOnlyField label="Name" value={user.name ?? "Not set"} />
        <ReadOnlyField label="Email" value={user.email ?? "Not set"} />
        <ReadOnlyField label="Role" value={user.role.toLowerCase()} capitalize />
      </CardContent>
    </Card>
  );
}

function ReadOnlyField({ label, value, capitalize = false }: { label: string; value: string; capitalize?: boolean }) {
  return <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2.5"><span className="text-sm text-muted-foreground">{label}</span><span className={cn("text-sm font-medium", capitalize && "capitalize")}>{value}</span></div>;
}

function PasswordCard() {
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    startTransition(async () => {
      const result = await changePassword({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Password updated");
      element.reset();
    });
  }
  return (
    <Card>
      <CardHeader><CardTitle>Security</CardTitle><CardDescription>Change the password used for credentials login.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="current-password">Current password</Label><Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
          <div className="space-y-1.5"><Label htmlFor="new-password">New password</Label><Input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></div>
          <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}Update password</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PropertyCard({ property, canManage }: { property: Props["property"]; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updatePropertySettings({ name: form.get("name"), address: form.get("address"), city: form.get("city") });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Property details updated");
      router.refresh();
    });
  }
  return (
    <Card>
      <CardHeader><CardTitle>Current property</CardTitle><CardDescription>{canManage ? "Update the identity shown across the app." : "Property details are managed by administrators."}</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="property-name">Name</Label><Input id="property-name" name="name" defaultValue={property.name} disabled={!canManage || pending} required /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="property-city">City</Label><Input id="property-city" name="city" defaultValue={property.city ?? ""} disabled={!canManage || pending} /></div><div className="space-y-1.5"><Label>Slug</Label><Input value={property.slug} disabled readOnly /></div></div>
          <div className="space-y-1.5"><Label htmlFor="property-address">Address</Label><Input id="property-address" name="address" defaultValue={property.address ?? ""} disabled={!canManage || pending} /></div>
          {canManage ? <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : null}Save property</Button> : null}
        </form>
      </CardContent>
    </Card>
  );
}
