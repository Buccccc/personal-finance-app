"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { NAV_GROUPS, isActiveHref } from "./nav-items";

export function Sidebar({ email }: { email?: string | null }) {
  const pathname = usePathname();
  // Optimistic active state: highlight the clicked link instantly, before the
  // route (and its data) finish loading. Cleared during render once the URL
  // catches up (render-time adjustment — avoids setState-in-effect).
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setPendingHref(null);
  }

  const activeHref = pendingHref ?? pathname;
  const isActive = (href: string) => isActiveHref(activeHref, href);

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="h-4.5 w-4.5" />
        </span>
        <div className="leading-tight">
          <p className="font-heading text-base font-bold tracking-tight">
            Finance
          </p>
          <p className="text-[11px] text-muted-foreground">personal</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setPendingHref(href)}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      active
                        ? "text-primary"
                        : "text-muted-foreground/70 group-hover:text-accent-foreground",
                    )}
                  />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t p-3">
        {email && (
          <p className="truncate px-3 pb-1 text-xs text-muted-foreground">
            {email}
          </p>
        )}
        <ThemeToggle />
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
