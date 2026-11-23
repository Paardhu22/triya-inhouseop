"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { BedDouble, Globe, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { BedForm } from "@/components/floor/bed-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { rejectRegistration, setWebsiteSlug } from "@/lib/actions/registrations";
import { paiseToRupees } from "@/lib/money";
import type { VacantBed } from "@/lib/queries/registrations";
import type { BedFormValues } from "@/lib/validations/tenant";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
type Request = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  preferredCheckIn: Date | null;
  kycKey: string | null;
  status: Status;
  rejectionReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
};

const TABS: { value: Status | "ALL"; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired" },
  { value: "ALL", label: "All" },
];

const STATUS_BADGE: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "default",
  APPROVED: "secondary",
  REJECTED: "destructive",
  EXPIRED: "outline",
};

const isoDay = (d: Date) => new Date(d).toISOString().slice(0, 10);

function prefill(request: Request, bed: VacantBed): BedFormValues {
  return {
    occupancyStatus: "OCCUPIED",
    fullName: request.fullName,
    phone: request.phone,
    email: request.email ?? "",
    rentAmount: bed.defaultRent ? String(paiseToRupees(bed.defaultRent)) : "",
    maintenanceCharge: bed.defaultMaintenance ? String(paiseToRupees(bed.defaultMaintenance)) : "",
    securityDeposit: "",
    checkInDate: request.preferredCheckIn ? isoDay(request.preferredCheckIn) : new Date().toISOString().slice(0, 10),
    paymentStatus: "PENDING",
    paymentMethod: "CASH",
    cashAmount: "",
    onlineAmount: "",
  };
}

export function RegistrationsClient({
  status,
  requests,
  counts,
  beds,
  isFlat,
  canReject,
  isAdmin,
  websiteSlug,
}: {
  status: Status | "ALL";
  requests: Request[];
  counts: Partial<Record<Status, number>>;
  beds: VacantBed[];
  isFlat: boolean;
  canReject: boolean;
  isAdmin: boolean;
  websiteSlug: string | null;
}) {
  const router = useRouter();
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [bedId, setBedId] = useState("");
  const [reason, setReason] = useState("");
  const [slug, setSlug] = useState(websiteSlug ?? "");
  const [pending, startTransition] = useTransition();

  const review = requests.find((r) => r.id === reviewId) ?? null;
  const bed = beds.find((b) => b.id === bedId) ?? null;
  const noun = isFlat ? "Flat" : "Room";
  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + (b ?? 0), 0), [counts]);

  function close() {
    setReviewId(null);
    setBedId("");
    setReason("");
  }

  function onReject() {
    if (!review) return;
    startTransition(async () => {
      const res = await rejectRegistration(review.id, reason);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Request rejected and its KYC image deleted");
      close();
      router.refresh();
    });
  }

  function onSaveSlug() {
    startTransition(async () => {
      const res = await setWebsiteSlug(slug);
      if (!res.ok) return void toast.error(res.error);
      toast.success(slug.trim() ? "Website registration enabled for this property" : "Website registration disabled");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {isAdmin ? (
        <section className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/25 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold"><Globe aria-hidden="true" className="size-3.5 text-primary/70" />Public website link</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Enter the website listing slug (e.g. <code>triya-house</code>) to accept registrations for this property. Leave blank to disable.
              {websiteSlug ? null : " Registrations are currently off."}
            </p>
          </div>
          <Input plain className="h-9 w-56" value={slug} maxLength={80} placeholder="website-listing-slug" aria-label="Website listing slug" onChange={(e) => setSlug(e.target.value)} disabled={pending} />
          <Button size="sm" onClick={onSaveSlug} disabled={pending || slug.trim() === (websiteSlug ?? "")}>Save</Button>
        </section>
      ) : null}

      <nav aria-label="Filter requests" className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const count = tab.value === "ALL" ? total : counts[tab.value] ?? 0;
          const active = status === tab.value;
          return (
            <Link key={tab.value} href={`/registrations?status=${tab.value}`} aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>
              {tab.label} <span className="tabular-nums opacity-70">{count}</span>
            </Link>
          );
        })}
      </nav>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center">
          <UserPlus aria-hidden="true" className="mx-auto mb-3 size-7 text-primary/50" />
          <p className="text-sm font-medium">No {status === "ALL" ? "" : status.toLowerCase() + " "}requests</p>
          <p className="mx-auto mt-2 max-w-sm text-xs text-muted-foreground">New registrations from the public website appear here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.fullName}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {r.phone}{r.email ? ` · ${r.email}` : ""}
                  {r.preferredCheckIn ? ` · check-in ${format(new Date(isoDay(r.preferredCheckIn)), "dd MMM yyyy")}` : ""}
                  {` · submitted ${format(r.createdAt, "dd MMM yyyy")}`}
                </p>
                {r.rejectionReason ? <p className="mt-0.5 text-xs text-muted-foreground">Reason: {r.rejectionReason}</p> : null}
              </div>
              <Badge variant={STATUS_BADGE[r.status]}>{r.status.toLowerCase()}</Badge>
              {r.status === "PENDING" ? <Button size="sm" onClick={() => setReviewId(r.id)}>Review</Button> : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(review)} onOpenChange={(open) => { if (!open && !pending) close(); }}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-14">
            <span className="flex items-center gap-2 text-[11px] font-medium text-primary/80"><UserPlus aria-hidden="true" className="size-3.5" />Registration request</span>
            <DialogTitle className="text-xl leading-snug">
              {bed ? `${isFlat ? `Flat ${bed.roomNumber}` : `Room ${bed.roomNumber} · Bed ${bed.bedLabel}`}` : review?.fullName}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {bed ? "Review the prefilled details, set the charges, and save to approve." : "Choose a vacant bed to assign, or reject the request."}
            </DialogDescription>
          </DialogHeader>

          {review && bed ? (
            <BedForm
              key={`${review.id}:${bed.id}`}
              bedId={bed.id}
              isFlat={isFlat}
              defaults={prefill(review, bed)}
              existingPhotoKey={review.kycKey}
              registrationId={review.id}
              onClose={close}
            />
          ) : review ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-[11px] text-muted-foreground">Name</dt><dd>{review.fullName}</dd></div>
                <div><dt className="text-[11px] text-muted-foreground">Phone</dt><dd>{review.phone}</dd></div>
                <div><dt className="text-[11px] text-muted-foreground">Email</dt><dd>{review.email ?? "—"}</dd></div>
                <div><dt className="text-[11px] text-muted-foreground">Preferred check-in</dt><dd>{review.preferredCheckIn ? format(new Date(isoDay(review.preferredCheckIn)), "dd MMM yyyy") : "—"}</dd></div>
              </dl>
              <div>
                <p className="mb-2 text-[11px] text-muted-foreground">KYC image</p>
                {review.kycKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${review.kycKey}`} alt="Submitted KYC" className="max-h-56 rounded-lg border border-border object-contain" />
                ) : <p className="text-xs text-muted-foreground">No image submitted.</p>}
              </div>
              <div>
                <label htmlFor="reg-bed" className="mb-1.5 flex items-center gap-2 text-xs font-medium"><BedDouble aria-hidden="true" className="size-3.5 text-primary/70" />Assign to</label>
                <select id="reg-bed" value={bedId} onChange={(e) => setBedId(e.target.value)} disabled={pending}
                  className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="">{beds.length ? `Select a vacant ${isFlat ? "flat" : "bed"}` : `No vacant ${isFlat ? "flats" : "beds"}`}</option>
                  {beds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.blockName ? `Block ${b.blockName} · ` : ""}{b.floorLabel} · {isFlat ? `Flat ${b.roomNumber}` : `${noun} ${b.roomNumber} · Bed ${b.bedLabel}`}
                    </option>
                  ))}
                </select>
              </div>
              {canReject ? (
                <div className="space-y-2 border-t border-border pt-4">
                  <label htmlFor="reg-reason" className="text-xs font-medium">Reject this request <span className="font-normal text-muted-foreground">(reason optional)</span></label>
                  <Input plain id="reg-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} disabled={pending} placeholder="e.g. No vacancy until March" />
                  <Button variant="outline" size="sm" onClick={onReject} disabled={pending}>
                    {pending ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}Reject request
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
