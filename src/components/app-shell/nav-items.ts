import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  TrendingUp,
  CalendarClock,
  PiggyBank,
  Landmark,
  Layers,
  ListChecks,
  Upload,
  Tags,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Money",
    items: [
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/import", label: "Import", icon: Upload },
      { href: "/review", label: "Review", icon: ListChecks },
      { href: "/accounts", label: "Accounts", icon: Landmark },
      { href: "/net-worth", label: "Net Worth", icon: Wallet },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/trends", label: "Trends", icon: TrendingUp },
      { href: "/bills", label: "Bills & Calendar", icon: CalendarClock },
    ],
  },
  {
    label: "Planning",
    items: [
      { href: "/allocations", label: "Allocations", icon: PiggyBank },
      { href: "/categories", label: "Categories", icon: Tags },
      { href: "/rules", label: "Rules & Merchants", icon: Layers },
    ],
  },
];

export function isActiveHref(activeHref: string, href: string): boolean {
  return href === "/" ? activeHref === "/" : activeHref.startsWith(href);
}
