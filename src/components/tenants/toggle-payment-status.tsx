"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { type PaymentMethod } from "@/generated/prisma/client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { togglePaymentStatus } from "@/lib/actions/tenants";

export function TogglePaymentStatusButton({
  tenancyId,
  currentStatus,
  duePaise,
}: {
  tenancyId: string;
  currentStatus: "PAID" | "PENDING" | "OVERDUE";
  /** The month's rent due (rent + maintenance) in paise — what a split must add up to. */
  duePaise?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [cashAmount, setCashAmount] = useState<string>("");
  const [onlineAmount, setOnlineAmount] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const isPaid = currentStatus === "PAID";

  const handleToggle = () => {
    if (isPaid) {
      // Mark as unpaid directly
      startTransition(async () => {
        const result = await togglePaymentStatus(tenancyId, "PENDING");
        if (result.ok) {
          toast.success("Payment status marked as pending");
        } else {
          toast.error(result.error);
        }
      });
    } else {
      // Open dialog to mark as paid
      setMethod("CASH");
      setCashAmount("");
      setOnlineAmount("");
      setError(null);
      setIsOpen(true);
    }
  };

  const handleSubmit = () => {
    let finalCash: number | undefined;
    let finalOnline: number | undefined;

    if (method === "SPLIT") {
      finalCash = parseInt(cashAmount, 10);
      finalOnline = parseInt(onlineAmount, 10);
      
      if (isNaN(finalCash) || isNaN(finalOnline)) {
        setError("Please enter valid amounts.");
        return;
      }

      if (duePaise !== undefined && finalCash + finalOnline !== duePaise / 100) {
        setError(`Split amounts must equal the month's rent of ₹${duePaise / 100}`);
        return;
      }
    }

    setError(null);
    startTransition(async () => {
      const result = await togglePaymentStatus(
        tenancyId,
        "PAID",
        method,
        finalCash,
        finalOnline
      );
      
      if (result.ok) {
        toast.success("Payment status marked as paid");
        setIsOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleToggle}
        disabled={isPending}
      >
        {isPaid ? (
          <>
            <CircleDashed className="size-4 text-muted-foreground" />
            Mark Unpaid
          </>
        ) : (
          <>
            <CheckCircle2 className="size-4 text-emerald-500" />
            Mark Paid
          </>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Select how the payment was made to keep the records accurate.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                  <SelectItem value="SPLIT">Split Payment (Cash + Online)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {method === "SPLIT" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cash Amount (₹)</Label>
                  <Input 
                    type="number" 
                    min={0}
                    value={cashAmount} 
                    onChange={(e) => setCashAmount(e.target.value)} 
                    placeholder="e.g. 5000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Online Amount (₹)</Label>
                  <Input 
                    type="number" 
                    min={0}
                    value={onlineAmount} 
                    onChange={(e) => setOnlineAmount(e.target.value)} 
                    placeholder="e.g. 4000"
                  />
                </div>
              </div>
            )}
            
            {error && <p className="text-sm text-destructive font-medium">{error}</p>}
            
            {duePaise !== undefined && method === "SPLIT" && !error && (
              <p className="text-xs text-muted-foreground">
                Total expected: ₹{duePaise / 100}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
