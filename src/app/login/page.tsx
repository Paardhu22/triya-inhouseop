import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginScreen } from "@/components/auth/login-screen";
import { getLoginAccounts } from "@/lib/queries/login";
import { safeCallbackPath } from "@/lib/security/redirect";

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
  const users = await getLoginAccounts();

  return <LoginScreen callbackUrl={safeCallbackPath(callbackUrl)} users={users} />;
}
