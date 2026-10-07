import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { prisma } from "@/lib/prisma";

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

  // Accounts offered in the login dropdown: the admin plus every property whose
  // account is still active (deactivated properties disappear from here too).
  const users = await prisma.user.findMany({
    where: { isActive: true, OR: [{ role: "ADMIN" }, { property: { isActive: true } }] },
    select: { name: true, email: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-card shadow-md md:grid-cols-[0.82fr_1.18fr]">
        {/* Soft panel — brand and introduction */}
        <div className="relative flex flex-col justify-between gap-12 overflow-hidden bg-muted p-8 lg:p-10">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-5 -bottom-12 leading-none font-bold tracking-tighter text-primary/[0.04] select-none"
            style={{ fontSize: "11rem" }}
          >
            PG
          </span>
          <span className="relative text-xs font-semibold tracking-[0.18em] text-muted-foreground">
            Property Manager
          </span>
          <div className="relative">
            <h2 className="text-[2.5rem] leading-[1.15] font-semibold tracking-[-0.045em] text-foreground">
              Triya
              <br />
              Manager
            </h2>
            <p className="mt-4 max-w-[26ch] text-sm leading-relaxed text-muted-foreground">
              Rooms, beds, tenants and payments — organized in one place.
            </p>
          </div>
        </div>

        {/* Form panel */}
        <div className="p-8 sm:p-10 lg:p-12">
          <div className="mb-8">
            <h1 className="text-[1.75rem] font-semibold tracking-[-0.045em]">Sign in</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Welcome back. Enter your credentials to continue.
            </p>
          </div>
          <LoginForm callbackUrl={callbackUrl ?? "/dashboard"} users={users} />
          <p className="mt-8 text-xs text-muted-foreground">
            Select your account, then enter its password to continue.
          </p>
        </div>
      </div>
    </div>
  );
}
