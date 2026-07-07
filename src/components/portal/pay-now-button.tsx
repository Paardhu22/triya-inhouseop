"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import {
  initiateAdvancePayment,
  initiateTenantPayment,
  verifyAdvancePayment,
  verifyTenantPayment,
} from "@/lib/actions/payments";

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: "payment.failed", handler: (response: { error: { description: string } }) => void) => void;
    };
  }
}

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  theme?: { color?: string };
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
  prefill?: { name?: string; email?: string; contact?: string };
};

type ContactInfo = { userName?: string | null; userEmail?: string | null; userPhone?: string | null };

/** A "Pay Now"-style button that opens Razorpay Standard Checkout for whichever
 * order-initiate/verify server actions it's given (rent, advance/deposit, ...). */
function RazorpayPayButton({
  label,
  description,
  initiate,
  verify,
  userName,
  userEmail,
  userPhone,
}: ContactInfo & {
  label: string;
  description: string;
  initiate: () => Promise<ActionResult<{ orderId: string; amount: number; currency: string }>>;
  verify: (input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [pending, startTransition] = useTransition();

  function pay() {
    if (!window.Razorpay) {
      toast.error("Payment gateway is still loading. Please try again in a moment.");
      return;
    }

    startTransition(async () => {
      const order = await initiate();
      if (!order.ok) {
        toast.info(order.error);
        return;
      }

      const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!keyId) {
        toast.error("Online payments are coming soon. Please pay by cash for now.");
        return;
      }

      const razorpay = new window.Razorpay!({
        key: keyId,
        amount: order.data.amount,
        currency: order.data.currency,
        order_id: order.data.orderId,
        name: "DAZZ Manager",
        description,
        theme: { color: "#111827" },
        prefill: {
          name: userName ?? undefined,
          email: userEmail ?? undefined,
          contact: userPhone ?? undefined,
        },
        modal: {
          ondismiss: () => {
            toast.info("Payment cancelled.");
          },
        },
        handler: (response) => {
          startTransition(async () => {
            const verified = await verify({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            if (!verified.ok) {
              toast.error(verified.error);
              return;
            }
            toast.success("Payment successful!");
            router.refresh();
          });
        },
      });

      razorpay.on("payment.failed", (response) => {
        toast.error(response.error?.description || "Payment failed. Please try again.");
      });

      razorpay.open();
    });
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
        onLoad={() => setScriptReady(true)}
      />
      <Button onClick={pay} disabled={pending || !scriptReady} size="lg">
        {pending ? "Processing…" : label}
      </Button>
    </>
  );
}

export function PayNowButton(contact: ContactInfo) {
  return (
    <RazorpayPayButton
      {...contact}
      label="Pay Now"
      description="Rent payment"
      initiate={initiateTenantPayment}
      verify={verifyTenantPayment}
    />
  );
}

export function AdvancePayButton(contact: ContactInfo) {
  return (
    <RazorpayPayButton
      {...contact}
      label="Pay Advance"
      description="Advance (security deposit) payment"
      initiate={initiateAdvancePayment}
      verify={verifyAdvancePayment}
    />
  );
}
