import type { Metadata } from "next";
import { redirect } from "next/navigation";

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
    <div className="flex min-h-screen items-center justify-center bg-[#2c3040] px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-card shadow-lg md:grid-cols-[0.82fr_1.18fr]">
        {/* Editorial sand panel — brand + headline, baseline-anchored */}
        <div className="relative flex flex-col justify-between gap-12 overflow-hidden bg-secondary-surface p-8 lg:p-10">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-5 -bottom-12 leading-none font-bold tracking-tighter text-primary/[0.06] select-none"
            style={{ fontSize: "11rem" }}
          >
            PG
          </span>
          <span className="relative text-xs font-semibold tracking-[0.18em] text-primary/55 uppercase">
            Property Manager
          </span>
          <div className="relative">
            <h2 className="text-[2.25rem] leading-[1.02] font-bold tracking-[-0.02em] text-primary">
              Triya
              <br />
              Manager
            </h2>
            <p className="mt-4 max-w-[26ch] text-sm leading-relaxed text-primary/70">
              Rooms, beds, tenants and payments — organized on one precise grid.
            </p>
          </div>
        </div>

        {/* Form panel */}
        <div className="p-8 sm:p-10 lg:p-12">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Welcome back. Enter your credentials to continue.
            </p>
          </div>
          <LoginForm callbackUrl={callbackUrl ?? "/dashboard"} />
          <p className="mt-8 text-xs text-muted-foreground">
            Demo: admin@triya.local · Admin@12345
          </p>
        </div>
      </div>
    </div>
  );
}
