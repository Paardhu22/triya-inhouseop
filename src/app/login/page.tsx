import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const { callbackUrl } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Triya Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to manage your properties
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <LoginForm callbackUrl={callbackUrl ?? "/dashboard"} />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Demo: admin@triya.local · Admin@12345
        </p>
      </div>
    </div>
  );
}
