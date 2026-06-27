"use client";

import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InvoicePreviewDialog } from "./invoice-preview-dialog";

export function SendInvoiceButton({ tenancyId }: { tenancyId: string }) {
  return (
    <InvoicePreviewDialog
      tenancyId={tenancyId}
      trigger={
        <Button variant="outline" size="sm">
          <Send className="size-4" />
          Send Invoice
        </Button>
      }
    />
  );
}
