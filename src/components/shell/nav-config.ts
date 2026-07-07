import {
  Banknote,
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

const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };

// Manager: day-to-day property operations for their single assigned property.
export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/floor-manager", label: "Floor Manager", icon: Building2 },
  { href: "/complaints", label: "Complaints", icon: MessageSquareWarning },
  { href: "/expenses", label: "Expense Tracker", icon: Receipt },
  { href: "/tenants", label: "Tenants", icon: Users },
  { href: "/collections", label: "Collections", icon: Banknote },
];

export const SETTINGS_NAV: NavItem[] = [SETTINGS_ITEM];

// The App Owner maintains the app, not properties — their only nav is the console
// (managing Property Owners) and their own account settings. No property-operational
// pages (dashboard, floor manager, complaints, expenses, etc.).
export const APP_OWNER_NAV: NavItem[] = [
  { href: "/admin", label: "App Owner Console", icon: ShieldCheck },
  SETTINGS_ITEM,
];

// The Property Owner runs their own properties end-to-end: Owner Dashboard replaces
// the plain staff Dashboard, plus full access to every operational page, scoped to
// whichever of their properties is currently selected.
export const OWNER_NAV: NavItem[] = [
  { href: "/owner-dashboard", label: "Owner Dashboard", icon: LayoutDashboard },
  { href: "/floor-manager", label: "Floor Manager", icon: Building2 },
  { href: "/complaints", label: "Complaints", icon: MessageSquareWarning },
  { href: "/expenses", label: "Expense Tracker", icon: Receipt },
  { href: "/tenants", label: "Tenants", icon: Users },
  { href: "/collections", label: "Collections", icon: Banknote },
  SETTINGS_ITEM,
];
