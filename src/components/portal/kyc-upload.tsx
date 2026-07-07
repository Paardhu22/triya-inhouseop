"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { uploadOwnKycDocument } from "@/lib/actions/portal";

export function KycUpload({ photoUrl }: { photoUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);

  function submit(file: File) {
    setFileName(file.name);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const res = await uploadOwnKycDocument(formData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(photoUrl ? "Aadhaar updated" : "Aadhaar uploaded");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">KYC — Aadhaar verification</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {photoUrl
              ? "Your Aadhaar is on file. You can replace it below if needed."
              : "Upload a photo or PDF of your Aadhaar card to complete KYC. Full verification is coming soon — for now this just gets it on file for your manager."}
          </p>
        </div>
        {photoUrl ? (
          <a
            href={`/api/files/${photoUrl}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-available"
          >
            <CheckCircle2 className="size-3.5" />
            View uploaded document
          </a>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) submit(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant={photoUrl ? "outline" : "default"}
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {photoUrl ? "Replace Aadhaar" : "Upload Aadhaar"}
        </Button>
        {pending && fileName ? <span className="text-xs text-muted-foreground">{fileName}</span> : null}
      </div>
    </div>
  );
}
