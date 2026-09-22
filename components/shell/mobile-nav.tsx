"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLinkStatus } from "next/link";
import { Activity, CalendarRange, Dumbbell, House, Loader2, Utensils } from "lucide-react";
import { isActivePath } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The phone's navigation: five tabs along the bottom, where a thumb reaches.
 *
 * Session sits in the middle and is the only filled tab, because it is the one
 * screen used standing up with a bar in the other hand. League, Coach and
 * Profile live in the avatar menu instead — nobody needs them mid-set.
 */
const TABS = [
  { href: "/", label: "Today", icon: House },
  { href: "/program", label: "Program", icon: CalendarRange },
  { href: "/session", label: "Session", icon: Dumbbell, primary: true },
  { href: "/progress", label: "Body", icon: Activity },
  { href: "/nutrition", label: "Food", icon: Utensils },
] as const;

/** A live session owns the bottom of the screen with its own bar. */
export function isFocusedSession(pathname: string) {
  return /^\/session\/[^/]+/.test(pathname);
}

export function MobileNav() {
  const pathname = usePathname();
  if (isFocusedSession(pathname)) return null;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-sidebar-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto grid h-16 max-w-[560px] grid-cols-5">
        {TABS.map((tab) => {
          const active = isActivePath(pathname, tab.href);
          const Icon = tab.icon;
          const primary = "primary" in tab && tab.primary;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className="flex flex-col items-center justify-center gap-1"
            >
              <span
                className={cn(
                  "flex items-center justify-center rounded-[11px] transition-colors",
                  primary ? "h-8 w-12" : "size-8",
                  primary
                    ? active
                      ? "bg-accent-hi text-[#0a0c0d]"
                      : "bg-accent text-[#0a0c0d]"
                    : active
                      ? "bg-accent-soft text-accent"
                      : "text-fg-soft",
                )}
              >
                <TabIcon Icon={Icon} active={active} primary={primary} />
              </span>
              <span
                className={cn(
                  "font-mono text-[9.5px] font-semibold tracking-[0.08em] uppercase",
                  active ? "text-fg" : "text-fg-dim",
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** The tab's own icon, or a spinner while that tab's page is loading. */
function TabIcon({
  Icon,
  active,
  primary,
}: {
  Icon: typeof House;
  active: boolean;
  primary: boolean;
}) {
  const { pending } = useLinkStatus();
  if (pending) {
    return <Loader2 aria-label="Loading" role="status" className="size-[18px] animate-spin" />;
  }
  return <Icon className="size-[18px]" strokeWidth={active || primary ? 2.25 : 1.75} />;
}
