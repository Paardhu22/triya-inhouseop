"use client";

import { FormEvent, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  KeyRound,
  Loader2,
  Plus,
  Power,
  PowerOff,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { Switch } from "@/components/ui/switch";
import { PropertyLogo } from "@/components/property/property-logo";
import {
  createProperty,
  removePropertyLogo,
  setAccountPassword,
  setPropertyActive,
  setPropertyLogo,
} from "@/lib/actions/properties";
import type { AdminPropertyRow } from "@/lib/queries/properties";
import { slugify } from "@/lib/slug";

export function PropertiesManager({ properties }: { properties: AdminPropertyRow[] }) {
  return (
    <Card>
      <CardHeader className="border-b sm:grid-cols-[1fr_auto]">
        <div>
          <CardTitle>Properties &amp; accounts</CardTitle>
          <CardDescription>
            Add a property with its login, reset a property&apos;s password, or deactivate one.
          </CardDescription>
        </div>
        <AddPropertyWizard />
      </CardHeader>
      <CardContent className="divide-y py-0">
        {properties.map((property) => (
          <PropertyRow key={property.id} property={property} />
        ))}
      </CardContent>
    </Card>
  );
}

function PropertyRow({ property }: { property: AdminPropertyRow }) {
  const account = property.users[0];
  // A flat is a room with a single bed, so bed-count == flat-count for flat properties.
  const unit = property.isFlat ? "flats" : "beds";

  return (
    <div className="flex flex-wrap items-center gap-3 py-3 first:pt-4 last:pb-4">
      <PropertyLogoControl propertyId={property.id} name={property.name} logoKey={property.logoKey} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{property.name}</p>
          {!property.isActive ? <Badge variant="secondary">Inactive</Badge> : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {account?.email ?? "No account"} · {property._count.floors} floors · {property._count.beds} {unit}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {account ? <ChangePasswordDialog account={account} /> : null}
        <ToggleActive property={property} />
      </div>
    </div>
  );
}

function PropertyLogoControl({
  propertyId,
  name,
  logoKey,
}: {
  propertyId: string;
  name: string;
  logoKey: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    const formData = new FormData();
    formData.set("propertyId", propertyId);
    formData.set("file", file);
    startTransition(async () => {
      const res = await setPropertyLogo(formData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Logo updated");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removePropertyLogo({ propertyId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Logo removed");
      router.refresh();
    });
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        title={logoKey ? "Change logo" : "Upload logo"}
        className="flex size-10 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground transition-colors hover:bg-muted/60 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <PropertyLogo logoKey={logoKey} name={name} className="size-full object-contain p-1" iconClassName="size-4" />
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg" hidden onChange={upload} />
      {logoKey ? (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          title="Remove logo"
          className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-destructive disabled:opacity-60"
        >
          <X className="size-2.5" />
        </button>
      ) : null}
    </div>
  );
}

function ChangePasswordDialog({ account }: { account: { id: string; email: string } }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get("newPassword") ?? "");
    startTransition(async () => {
      const res = await setAccountPassword({ userId: account.id, newPassword });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Password updated");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="size-4" />
          Password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset account password</DialogTitle>
          <DialogDescription>Set a new password for {account.email}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`pw-${account.id}`}>New password</Label>
            <Input
              id={`pw-${account.id}`}
              name="newPassword"
              type="text"
              minLength={8}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Update password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleActive({ property }: { property: AdminPropertyRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(active: boolean) {
    startTransition(async () => {
      const res = await setPropertyActive({ propertyId: property.id, active });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(active ? "Property reactivated" : "Property deactivated");
      setOpen(false);
      router.refresh();
    });
  }

  if (!property.isActive) {
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(true)}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
        Reactivate
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
          <PowerOff className="size-4" />
          Deactivate
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate {property.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It disappears from every property switcher and its account can no longer sign in.
            All {property._count.tenants} tenants, payments and history are kept — you can
            reactivate it anytime.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={() => run(false)}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Deactivate
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Add-property wizard
// ---------------------------------------------------------------------------
type SectionInput = { name: string; rooms: string; floors: string };

const emptySection = (): SectionInput => ({ name: "", rooms: "", floors: "" });

function parseNumbers(value: string): number[] {
  return value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((token) => Math.trunc(Number(token)))
    .filter((n) => Number.isFinite(n));
}

function AddPropertyWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [isFlat, setIsFlat] = useState(false);
  const [hasBlocks, setHasBlocks] = useState(false);
  const [email, setEmail] = useState("");
  const [emailEdited, setEmailEdited] = useState(false);
  const [password, setPassword] = useState("");
  const [sections, setSections] = useState<SectionInput[]>([emptySection()]);

  const derivedEmail = name.trim() ? `${slugify(name) || "property"}@triya.local` : "";
  const effectiveEmail = emailEdited ? email : derivedEmail;

  const roomsPerFloor = (section: SectionInput): number[] =>
    isFlat
      ? Array.from({ length: Math.max(0, Math.trunc(Number(section.rooms) || 0)) }, () => 1)
      : parseNumbers(section.rooms);

  const totals = useMemo(() => {
    return sections.reduce(
      (acc, section) => {
        const floors = parseNumbers(section.floors).length;
        const rooms = roomsPerFloor(section);
        return {
          floors: acc.floors + floors,
          rooms: acc.rooms + rooms.length * floors,
          beds: acc.beds + rooms.reduce((sum, n) => sum + n, 0) * floors,
        };
      },
      { floors: 0, rooms: 0, beds: 0 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, isFlat]);

  function resetAll() {
    setStep(1);
    setName("");
    setCity("");
    setAddress("");
    setPhone("");
    setIsFlat(false);
    setHasBlocks(false);
    setEmail("");
    setEmailEdited(false);
    setPassword("");
    setSections([emptySection()]);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetAll();
  }

  function goToStructure() {
    if (name.trim().length < 2) return toast.error("Enter a property name");
    if (!effectiveEmail) return toast.error("Enter an account email");
    if (password.length < 8) return toast.error("Account password must be at least 8 characters");
    setSections((prev) => (hasBlocks ? (prev.length ? prev : [emptySection()]) : [{ ...(prev[0] ?? emptySection()), name: "" }]));
    setStep(2);
  }

  function updateSection(index: number, patch: Partial<SectionInput>) {
    setSections((prev) => prev.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  }

  function create() {
    const payloadSections = sections.map((section) => ({
      name: section.name,
      roomsPerFloor: roomsPerFloor(section),
      floors: parseNumbers(section.floors),
    }));
    startTransition(async () => {
      const res = await createProperty({
        name,
        city,
        address,
        phone,
        isFlat,
        hasBlocks,
        account: { email: effectiveEmail, password },
        sections: payloadSections,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${name.trim()} created`);
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add property
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{step === 1 ? "New property" : "Structure"}</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Property details and the login account that manages it."
              : hasBlocks
                ? "Define each block's floors and rooms."
                : "Define the floors and rooms for this property."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prop-name">Property name</Label>
              <Input
                id="prop-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                placeholder="Sunrise Residency"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prop-city">City</Label>
                <Input id="prop-city" value={city} onChange={(event) => setCity(event.target.value)} maxLength={100} placeholder="Hyderabad" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prop-phone">Phone</Label>
                <Input id="prop-phone" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={20} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prop-address">Address</Label>
              <Input id="prop-address" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={240} placeholder="Optional" />
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Self-contained flats</p>
                <p className="text-xs text-muted-foreground">Studios/1-bed flats instead of shared rooms.</p>
              </div>
              <Switch checked={isFlat} onCheckedChange={setIsFlat} />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Uses blocks</p>
                <p className="text-xs text-muted-foreground">Organised into blocks (A, B, …).</p>
              </div>
              <Switch checked={hasBlocks} onCheckedChange={setHasBlocks} />
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <p className="text-sm font-medium">Login account</p>
              <div className="space-y-1.5">
                <Label htmlFor="prop-email">User (email)</Label>
                <Input
                  id="prop-email"
                  type="email"
                  value={effectiveEmail}
                  onChange={(event) => {
                    setEmailEdited(true);
                    setEmail(event.target.value);
                  }}
                  placeholder="account@triya.local"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prop-password">Password</Label>
                <Input
                  id="prop-password"
                  type="text"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
              </div>
            </div>

            <DialogFooter>
              <Button onClick={goToStructure}>
                Next
                <ArrowRight className="size-4" />
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map((section, index) => (
              <div key={index} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {hasBlocks ? `Block ${section.name || index + 1}` : "Floors & rooms"}
                  </p>
                  {hasBlocks && sections.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      onClick={() => setSections((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
                {hasBlocks ? (
                  <div className="space-y-1.5">
                    <Label>Block name</Label>
                    <Input
                      value={section.name}
                      onChange={(event) => updateSection(index, { name: event.target.value })}
                      maxLength={30}
                      placeholder="A"
                    />
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{isFlat ? "Flats per floor" : "Rooms per floor"}</Label>
                    <Input
                      value={section.rooms}
                      onChange={(event) => updateSection(index, { rooms: event.target.value })}
                      placeholder={isFlat ? "5" : "2, 2, 3, 3, 1"}
                    />
                    <p className="text-xs text-muted-foreground">
                      {isFlat ? "How many flats on each floor." : "Bed-count per room, in order."}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Floor numbers</Label>
                    <Input
                      value={section.floors}
                      onChange={(event) => updateSection(index, { floors: event.target.value })}
                      placeholder="3, 4, 5"
                    />
                    <p className="text-xs text-muted-foreground">Comma-separated.</p>
                  </div>
                </div>
              </div>
            ))}

            {hasBlocks ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setSections((prev) => [...prev, emptySection()])}>
                <Plus className="size-4" />
                Add block
              </Button>
            ) : null}

            <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
              Will create <span className="font-medium text-foreground tabular-nums">{totals.floors}</span> floors ·{" "}
              <span className="font-medium text-foreground tabular-nums">{totals.rooms}</span> {isFlat ? "flats" : "rooms"}
              {isFlat ? null : (
                <>
                  {" "}·{" "}
                  <span className="font-medium text-foreground tabular-nums">{totals.beds}</span> beds
                </>
              )}
            </div>

            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(1)} disabled={pending}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button onClick={create} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Create property
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
