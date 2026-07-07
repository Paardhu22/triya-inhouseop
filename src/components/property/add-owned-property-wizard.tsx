"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { createOwnedProperty } from "@/lib/actions/owned-properties";
import { slugify } from "@/lib/slug";

type SectionInput = { name: string; rooms: string; floors: string };

const emptySection = (): SectionInput => ({ name: "", rooms: "", floors: "" });

function parseNumbers(value: string): number[] {
  return value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((token) => Math.trunc(Number(token)))
    .filter((n) => Number.isFinite(n));
}

/** Self-serve "add a property" wizard for Property Owners — same shape as the
 * legacy App Owner wizard, but auto-owned by the creating Property Owner. */
export function AddOwnedPropertyWizard() {
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

  const derivedEmail = name.trim() ? `${slugify(name) || "property"}@dazz.local` : "";
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
      const res = await createOwnedProperty({
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
          <DialogTitle>{step === 1 ? "Add a property" : "Structure"}</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Property details and the manager login who'll run it day to day."
              : hasBlocks
                ? "Define each block's floors and rooms."
                : "Define the floors and rooms for this property."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="op-name">Property name</Label>
              <Input
                id="op-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                placeholder="Sunrise Residency"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="op-city">City</Label>
                <Input id="op-city" value={city} onChange={(event) => setCity(event.target.value)} maxLength={100} placeholder="Hyderabad" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-phone">Phone</Label>
                <Input id="op-phone" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={20} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="op-address">Address</Label>
              <Input id="op-address" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={240} placeholder="Optional" />
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
              <p className="text-sm font-medium">Manager login</p>
              <div className="space-y-1.5">
                <Label htmlFor="op-email">User (email)</Label>
                <Input
                  id="op-email"
                  type="email"
                  value={effectiveEmail}
                  onChange={(event) => {
                    setEmailEdited(true);
                    setEmail(event.target.value);
                  }}
                  placeholder="account@dazz.local"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-password">Password</Label>
                <Input
                  id="op-password"
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
