import {
  Building2,
  LayoutDashboard,
  MessageSquareWarning,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/floor-manager", label: "Floor Manager", icon: Building2 },
  { href: "/complaints", label: "Complaints", icon: MessageSquareWarning },
  { href: "/expenses", label: "Expense Tracker", icon: Receipt },
  { href: "/tenants", label: "Tenants", icon: Users },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Admin", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];
