"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { BedDouble, CalendarClock, ImageIcon, IndianRupee, Loader2, Upload, UserRound, Wallet, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { giveNotice, saveBed } from "@/lib/actions/floor";
import { formatINR, rupeesToPaise } from "@/lib/money";
import { MAINTENANCE_RESERVE_PAISE, vacateByDate } from "@/lib/tenancy";
import { bedFormSchema, type BedFormValues } from "@/lib/validations/tenant";
import styles from "./bed-form.module.css";

type Props = {
  bedId: string;
  defaults: BedFormValues;
  existingPhotoKey?: string | null;
  /** Active tenancy id, when this bed is currently occupied. Enables Give Notice. */
  tenancyId?: string | null;
  /** When notice has already been served on the active tenancy. */
  noticeGivenDate?: Date | null;
  isFlat?: boolean;
  onClose: () => void;
};

export function BedForm({
  bedId,
  defaults,
  existingPhotoKey,
  tenancyId,
  noticeGivenDate,
  onClose,
  isFlat = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [noticePending, startNoticeTransition] = useTransition();
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    existingPhotoKey ? `/api/files/${existingPhotoKey}` : null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const form = useForm<BedFormValues>({
    resolver: zodResolver(bedFormSchema),
    defaultValues: defaults,
  });

  const [paymentStatus, paymentMethod, occupancyStatus, rentAmount, maintenanceCharge] = useWatch({
    control: form.control,
    name: ["paymentStatus", "paymentMethod", "occupancyStatus", "rentAmount", "maintenanceCharge"] as const,
  });
  const amount = (value: string) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const monthlyTotal = formatINR(rupeesToPaise(amount(rentAmount) + amount(maintenanceCharge)));
  const busy = pending || noticePending;
  const noun = isFlat ? "flat" : "bed";

  useEffect(() => () => {
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setPhoto(null);
    setPhotoPreview(existingPhotoKey ? `/api/files/${existingPhotoKey}` : null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onSubmit(values: BedFormValues) {
    const fd = new FormData();
    fd.append("bedId", bedId);
    fd.append("occupancyStatus", values.occupancyStatus);
    if (values.occupancyStatus === "OCCUPIED") {
      fd.append("fullName", values.fullName);
      fd.append("phone", values.phone);
      fd.append("email", values.email);
      fd.append("rentAmount", values.rentAmount);
      fd.append("maintenanceCharge", values.maintenanceCharge);
      fd.append("securityDeposit", values.securityDeposit);
      fd.append("checkInDate", values.checkInDate);
      fd.append("paymentStatus", values.paymentStatus);
      if (values.paymentMethod) fd.append("paymentMethod", values.paymentMethod);
      if (values.cashAmount) fd.append("cashAmount", values.cashAmount);
      if (values.onlineAmount) fd.append("onlineAmount", values.onlineAmount);
      if (photo) fd.append("photo", photo);
    }

    startTransition(async () => {
      const res = await saveBed(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Marking the bed Paid records a collection, which issues and sends its invoice.
      const invoice = res.data.invoice;
      if (!invoice) {
        toast.success("Saved");
      } else if (invoice.delivered) {
        toast.success("Saved", {
          description: `Rent recorded. Invoice ${invoice.number} sent to the tenant on WhatsApp.`,
        });
      } else {
        toast.warning("Saved", {
          description: invoice.number
            ? `Rent recorded. Invoice ${invoice.number} was created but not sent: ${invoice.error ?? "delivery failed"}. Resend it from Collections → Invoice History.`
            : `Rent recorded, but the invoice could not be created: ${invoice.error ?? "unknown error"}.`,
          duration: 10_000,
        });
      }
      onClose();
      router.refresh();
    });
  }

  function onGiveNotice() {
    if (!tenancyId) return;
    startNoticeTransition(async () => {
      const res = await giveNotice(tenancyId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const vacateBy = format(vacateByDate(new Date()), "dd MMM yyyy");
      toast.success(`Notice recorded. Tenant must vacate by ${vacateBy}`);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={styles.form}>
        <div className={styles.body}>
          <div className="mb-4 rounded-xl border border-border bg-muted/25 px-3.5 py-3">
            <FormField control={form.control} name="occupancyStatus" render={({ field }) => (
              <FormItem className="grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                <FormLabel className="flex items-center gap-2"><BedDouble aria-hidden="true" className="size-4 text-primary/70" />Occupancy</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={busy}>
                  <FormControl><SelectTrigger className="w-32 bg-card shadow-none sm:w-36"><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent><SelectItem value="AVAILABLE">Available</SelectItem><SelectItem value="OCCUPIED">Occupied</SelectItem></SelectContent>
                </Select>
                <FormMessage className="col-span-full" />
              </FormItem>
            )} />
          </div>

          {occupancyStatus === "OCCUPIED" ? (
            <>
              <section className={styles.section} aria-labelledby={`${id}-tenant`}>
                <h3 id={`${id}-tenant`} className="mb-3 flex items-center gap-2 text-[13px] font-semibold"><UserRound aria-hidden="true" className="size-3.5 text-primary/70" />Tenant details</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField control={form.control} name="fullName" render={({ field }) => (
                    <FormItem className="sm:col-span-2"><FormLabel>Tenant name</FormLabel><FormControl><Input plain autoComplete="name" maxLength={120} placeholder="e.g. Aarav Reddy" disabled={busy} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="checkInDate" render={({ field }) => (
                    <FormItem><FormLabel>Check-in date</FormLabel><FormControl><Input type="date" disabled={busy} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>Phone number</FormLabel><FormControl><Input plain type="tel" autoComplete="tel" maxLength={20} placeholder="9XXXXXXXXX" disabled={busy} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>Email <span className="font-normal text-muted-foreground">(optional)</span></FormLabel><FormControl><Input plain type="email" autoComplete="email" maxLength={254} placeholder="tenant@example.com" disabled={busy} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </section>

              <section className={styles.section} aria-labelledby={`${id}-charges`}>
                <h3 id={`${id}-charges`} className="mb-3 flex items-center gap-2 text-[13px] font-semibold"><IndianRupee aria-hidden="true" className="size-3.5 text-primary/70" />Charges</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField control={form.control} name="rentAmount" render={({ field }) => (
                    <FormItem><FormLabel>Monthly rent (₹)</FormLabel><FormControl><Input type="number" min={0} inputMode="decimal" placeholder="9000" disabled={busy} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="maintenanceCharge" render={({ field }) => (
                    <FormItem><FormLabel>Maintenance (₹/mo)</FormLabel><FormControl><Input type="number" min={0} step={1} inputMode="decimal" placeholder="0" disabled={busy} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="securityDeposit" render={({ field }) => (
                    <FormItem><FormLabel>Security deposit (₹)</FormLabel><FormControl><Input type="number" min={0} step={1} inputMode="decimal" placeholder="0" disabled={busy} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                {!tenancyId ? <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{formatINR(MAINTENANCE_RESERVE_PAISE)} from the deposit is held as a maintenance reserve on move-in.</p> : null}
              </section>

              <section className={styles.section} aria-labelledby={`${id}-payment`}>
                <h3 id={`${id}-payment`} className="mb-3 flex items-center gap-2 text-[13px] font-semibold"><Wallet aria-hidden="true" className="size-3.5 text-primary/70" />Payment</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField control={form.control} name="paymentStatus" render={({ field }) => (
                    <FormItem><FormLabel>Payment status</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={busy}><FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="PAID">Paid</SelectItem><SelectItem value="PENDING">Not paid</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                  )} />
                  {paymentStatus === "PAID" ? <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                    <FormItem><FormLabel>Payment method</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={busy}><FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select method" /></SelectTrigger></FormControl><SelectContent><SelectItem value="CASH">Cash</SelectItem><SelectItem value="ONLINE">Online</SelectItem><SelectItem value="SPLIT">Split (cash + online)</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                  )} /> : <p className="self-end pb-2 text-[11px] leading-relaxed text-muted-foreground">Choose Paid to record this month&apos;s collection and invoice.</p>}
                </div>
                {paymentStatus === "PAID" && paymentMethod === "SPLIT" ? <div className="mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="cashAmount" render={({ field }) => (<FormItem><FormLabel>Cash (₹)</FormLabel><FormControl><Input type="number" min={0} inputMode="decimal" placeholder="0" disabled={busy} {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="onlineAmount" render={({ field }) => (<FormItem><FormLabel>Online (₹)</FormLabel><FormControl><Input type="number" min={0} inputMode="decimal" placeholder="0" disabled={busy} {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">Cash + online must equal {monthlyTotal}.</p>
                </div> : null}
              </section>

              <section className={styles.section} aria-labelledby={`${id}-kyc`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {photoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoPreview} alt="KYC preview" className="size-12 shrink-0 rounded-lg border border-border object-cover" />
                    ) : <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ImageIcon className="size-4" /></span>}
                    <div className="min-w-0"><h3 id={`${id}-kyc`} className="text-[13px] font-semibold">KYC image</h3><p className="mt-1 max-w-52 truncate text-[11px] text-muted-foreground" title={photo?.name}>{photo ? photo.name : photoPreview ? "Saved identity image" : "Identity photo · optional"}</p></div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}><Upload aria-hidden="true" className="size-3.5" />{photoPreview ? "Replace" : "Upload image"}</Button>
                    {photo ? <Button type="button" variant="ghost" size="icon-sm" disabled={busy} onClick={clearPhoto} aria-label="Remove selected image"><X aria-hidden="true" className="size-3.5" /></Button> : null}
                  </div>
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="KYC image upload" onChange={onPhotoChange} disabled={busy} />
              </section>

              {tenancyId ? <section className={styles.section} aria-labelledby={`${id}-notice`}>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 px-3.5 py-3">
                  <div className="min-w-0 flex-1"><h3 id={`${id}-notice`} className="flex items-center gap-2 text-xs font-medium"><CalendarClock aria-hidden="true" className="size-3.5 text-muted-foreground" />Notice period</h3><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{noticeGivenDate ? `Given ${format(noticeGivenDate, "dd MMM yyyy")} · vacate by ${format(vacateByDate(noticeGivenDate), "dd MMM yyyy")}` : "15 days from the date notice is given."}</p></div>
                  <Button type="button" variant="ghost" size="sm" disabled={busy || Boolean(noticeGivenDate)} onClick={onGiveNotice}>{noticePending ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}{noticeGivenDate ? "Notice given" : "Give notice"}</Button>
                </div>
              </section> : null}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
              <BedDouble aria-hidden="true" className="mx-auto mb-3 size-7 text-primary/50" /><h3 className="text-sm font-medium">Make this {noun} available</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">{tenancyId ? `Saving will end the current tenancy and make this ${noun} ready for a new tenant.` : `This ${noun} will be available for a new tenant.`}</p>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.total}>
            <span className="text-[11px] text-muted-foreground">{occupancyStatus === "OCCUPIED" ? "Monthly total" : "Occupancy"}</span>
            <output aria-live="polite" className="block text-base font-semibold tracking-tight text-foreground tabular-nums">{occupancyStatus === "OCCUPIED" ? rentAmount || maintenanceCharge ? monthlyTotal : "—" : "Available"}</output>
          </div>
          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}{occupancyStatus === "AVAILABLE" ? "Save availability" : tenancyId ? "Save changes" : "Save tenant"}</Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
