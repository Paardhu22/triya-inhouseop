"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarClock, Loader2, Upload, X } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { giveNotice, saveBed } from "@/lib/actions/floor";
import { vacateByDate } from "@/lib/tenancy";
import { bedFormSchema, type BedFormValues } from "@/lib/validations/tenant";

type Props = {
  bedId: string;
  defaults: BedFormValues;
  existingPhotoKey?: string | null;
  /** Active tenancy id, when this bed is currently occupied. Enables Give Notice. */
  tenancyId?: string | null;
  /** When notice has already been served on the active tenancy. */
  noticeGivenDate?: Date | null;
  onClose: () => void;
};

export function BedForm({
  bedId,
  defaults,
  existingPhotoKey,
  tenancyId,
  noticeGivenDate,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [noticePending, startNoticeTransition] = useTransition();
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    existingPhotoKey ? `/api/files/${existingPhotoKey}` : null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<BedFormValues>({
    resolver: zodResolver(bedFormSchema),
    defaultValues: defaults,
  });

  const paymentStatus = form.watch("paymentStatus");
  const paymentMethod = form.watch("paymentMethod");
  const occupancyStatus = form.watch("occupancyStatus");

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  function clearPhoto() {
    setPhoto(null);
    setPhotoPreview(null);
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
      toast.success("Saved");
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tenant Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Aarav Reddy" disabled={pending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone Number</FormLabel>
              <FormControl>
                <Input type="tel" placeholder="9XXXXXXXXX" disabled={pending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Address (Optional)</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="tenant@example.com"
                  disabled={pending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="rentAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rent Amount (₹)</FormLabel>
                <FormControl>
                  <Input type="number" min={0} placeholder="9000" disabled={pending} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="checkInDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Check-in Date</FormLabel>
                <FormControl>
                  <Input type="date" disabled={pending} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="maintenanceCharge"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Maintenance Charge (₹/month)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    disabled={pending}
                    {...field}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Additional monthly charge on top of rent (e.g. electricity, housekeeping)
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="securityDeposit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Security Deposit (₹)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    disabled={pending}
                    {...field}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  ₹1,000 is held back as a maintenance reserve on move-in.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="paymentStatus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={pending}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="PAID">Paid</SelectItem>
                    <SelectItem value="PENDING">Not Paid</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="occupancyStatus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Occupancy Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={pending}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="AVAILABLE">Available</SelectItem>
                    <SelectItem value="OCCUPIED">Occupied</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {paymentStatus === "PAID" && occupancyStatus === "OCCUPIED" && (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={pending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="ONLINE">Online</SelectItem>
                      <SelectItem value="SPLIT">Split (Cash + Online)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {paymentMethod === "SPLIT" && (
              <div className="grid grid-cols-2 gap-2">
                <FormField
                  control={form.control}
                  name="cashAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cash (₹)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} placeholder="0" disabled={pending} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="onlineAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Online (₹)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} placeholder="0" disabled={pending} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>
        )}

        {tenancyId ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium">Notice period</p>
                <p className="text-xs text-muted-foreground">
                  {noticeGivenDate
                    ? `Notice given on ${format(noticeGivenDate, "dd MMM yyyy")} · vacate by ${format(vacateByDate(noticeGivenDate), "dd MMM yyyy")}`
                    : "15-day notice. Vacate-by date is set when notice is given."}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || noticePending || Boolean(noticeGivenDate)}
              onClick={onGiveNotice}
            >
              {noticePending ? <Loader2 className="size-4 animate-spin" /> : null}
              {noticeGivenDate ? "Notice given" : "Give Notice"}
            </Button>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label>KYC Image</Label>
          {photoPreview ? (
            <div className="relative w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="KYC preview"
                className="size-24 rounded-lg border object-cover"
              />
              <button
                type="button"
                onClick={clearPhoto}
                className="absolute -right-2 -top-2 rounded-full border border-border bg-background p-1 transition hover:bg-hover"
                aria-label="Remove image"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-input px-3 py-4 text-sm text-muted-foreground transition hover:bg-hover">
              <Upload className="size-4" />
              Upload image
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPhotoChange}
              />
            </label>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="submit" className="flex-1" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
