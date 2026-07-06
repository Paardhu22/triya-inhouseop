import { Building2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A property's uploaded logo, or a neutral building icon when it has none. The image
 * is served through the authenticated /api/files route (same-origin, so the browser
 * sends the session cookie); a plain <img> is used deliberately — next/image's
 * optimizer runs server-side without the cookie and would 401 on this route.
 */
export function PropertyLogo({
  logoKey,
  name,
  className,
  iconClassName,
}: {
  logoKey?: string | null;
  name?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  if (logoKey) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/files/${logoKey}`}
        alt={name ? `${name} logo` : "Property logo"}
        className={cn("object-contain", className)}
      />
    );
  }
  return <Building2 className={cn("text-muted-foreground", iconClassName ?? className)} />;
}
