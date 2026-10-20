"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { format } from "date-fns";
import Form from "next/form";
import { ChevronLeft, Dumbbell, History, LogOut, Search, Settings, ShieldCheck, Trophy, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { endNavigation, startNavigation } from "@/lib/activity";
import { titleForPath } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { AvatarBubble } from "./avatar-bubble";
import { isFocusedSession } from "./mobile-nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function greeting(hour: number) {
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

export function Topbar({
  displayName,
  avatarUrl,
  goalLabel,
  streakWeeks,
  coaching = false,
  admin = false,
}: {
  displayName: string;
  avatarUrl: string | null;
  goalLabel: string;
  /** Weeks in a row with a finished session (lib/training/streak.ts). */
  streakWeeks: number;
  coaching?: boolean;
  /** Signed in with an ADMIN_EMAILS address; the route checks again. */
  admin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = titleForPath(pathname);

  // The greeting and today's date depend on the viewer's clock, so they are
  // filled in after mount — rendering them on the server would hydrate wrong
  // for anyone outside the server's timezone.
  const [local, setLocal] = useState<{ title: string; sub: string } | null>(null);
  useEffect(() => {
    if (pathname !== "/") return;
    const now = new Date();
    setLocal({
      title: `${greeting(now.getHours())}, ${displayName.split(" ")[0]}`,
      sub: `${format(now, "EEEE, MMM dd")} · ${goalLabel}`,
    });
  }, [pathname, displayName, goalLabel]);

  const title = (pathname === "/" && local?.title) || base.title;
  const sub = (pathname === "/" && local?.sub) || base.sub;

  async function signOut() {
    startNavigation("/login");
    try {
      await createClient().auth.signOut();
    } catch (error) {
      endNavigation();
      throw error;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 flex-none items-center gap-3 border-b border-rule bg-topbar px-4 lg:h-[70px] lg:gap-[18px] lg:px-[30px]">
      {/* A live session hides the tab bar, so it needs its own way out. */}
      {isFocusedSession(pathname) ? (
        <Link
          href="/"
          aria-label="Back to Today"
          className="-ml-2 flex size-11 flex-none items-center justify-center rounded-[11px] text-fg-muted hover:bg-hover lg:hidden"
        >
          <ChevronLeft className="size-5" strokeWidth={2} />
        </Link>
      ) : null}
      <div className="min-w-0">
        <h1 className="truncate text-[16px] font-bold tracking-[-0.02em] lg:text-[17px]">
          {title}
        </h1>
        {sub ? (
          <p className="mt-[3px] truncate font-mono text-[10px] text-fg-dim uppercase lg:text-[11px]">
            {sub}
          </p>
        ) : null}
      </div>

      <div className="ml-auto flex flex-none items-center gap-2.5">
        {/* Searches the exercise library; next/form keeps it a client-side
            navigation to /exercises?q=… rather than a full page load. */}
        <Form
          action="/exercises"
          role="search"
          className="hidden w-[260px] items-center gap-[9px] rounded-[10px] border border-line bg-surface px-[13px] py-[7px] text-[13px] focus-within:border-line-hi lg:flex"
        >
          <Search className="size-[13px] flex-none text-fg-dim" strokeWidth={1.5} />
          <input
            name="q"
            type="search"
            placeholder="Search exercises…"
            aria-label="Search the exercise library"
            className="w-full min-w-0 bg-transparent py-0.5 text-fg-2 outline-none placeholder:text-fg-dim"
          />
        </Form>

        {streakWeeks > 0 ? (
          <div
            title="Weeks in a row with at least one finished session"
            className="hidden items-center gap-[7px] rounded-[10px] border border-line-hi bg-accent-soft px-[13px] py-[9px] font-mono text-xs font-bold text-accent sm:flex"
          >
            <span className="size-[6px] animate-pulse-dot rounded-full bg-accent" />
            {streakWeeks} WEEK STREAK
          </div>
        ) : (
          <div className="hidden rounded-[10px] border border-line bg-surface px-[13px] py-[9px] font-mono text-xs font-medium text-fg-dim sm:block">
            NO STREAK YET
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              // p-1 around the 36px avatar makes a 44px target without growing it.
              "-mr-1 rounded-full p-1 outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label="Account menu"
          >
            <AvatarBubble name={displayName} src={avatarUrl} size={36} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* On a phone these are not in the tab bar, so they live here. */}
            <DropdownMenuItem render={<Link href="/exercises" />} className="py-2.5 lg:hidden">
              <Dumbbell className="size-4" />
              Exercises
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/history" />} className="py-2.5 lg:hidden">
              <History className="size-4" />
              History
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/league" />} className="py-2.5 lg:hidden">
              <Trophy className="size-4" />
              Crew league
            </DropdownMenuItem>
            {coaching ? (
              <DropdownMenuItem render={<Link href="/coach" />} className="py-2.5 lg:hidden">
                <Users className="size-4" />
                My athletes
              </DropdownMenuItem>
            ) : null}
            {admin ? (
              <DropdownMenuItem render={<Link href="/admin" />} className="py-2.5 lg:hidden">
                <ShieldCheck className="size-4" />
                Admin
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator className="lg:hidden" />
            <DropdownMenuItem render={<Link href="/profile" />} className="py-2.5 lg:py-1">
              <Settings className="size-4" />
              Profile &amp; settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="py-2.5 lg:py-1">
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
