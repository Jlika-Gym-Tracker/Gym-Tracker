"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { format } from "date-fns";
import { LogOut, Search, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { titleForPath } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { AvatarBubble } from "./avatar-bubble";
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
  streakDays,
}: {
  displayName: string;
  avatarUrl: string | null;
  goalLabel: string;
  streakDays: number;
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
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="flex h-[70px] flex-none items-center gap-[18px] border-b border-rule bg-topbar px-[30px]">
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-bold tracking-[-0.02em]">
          {title}
        </h1>
        {sub ? (
          <p className="mt-[3px] truncate font-mono text-[11px] text-fg-dim uppercase">
            {sub}
          </p>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <button
          type="button"
          disabled
          title="Search arrives with the exercise library"
          className="flex w-[260px] items-center gap-[9px] rounded-[10px] border border-line bg-surface px-[13px] py-[9px] text-left text-[13px] text-fg-dim disabled:cursor-not-allowed"
        >
          <Search className="size-[13px]" strokeWidth={1.5} />
          Search exercises, meals…
        </button>

        {streakDays > 0 ? (
          <div className="flex items-center gap-[7px] rounded-[10px] border border-line-hi bg-accent-soft px-[13px] py-[9px] font-mono text-xs font-bold text-accent">
            <span className="size-[6px] animate-pulse-dot rounded-full bg-accent" />
            {streakDays} DAY STREAK
          </div>
        ) : (
          <div className="rounded-[10px] border border-line bg-surface px-[13px] py-[9px] font-mono text-xs font-medium text-fg-dim">
            NO STREAK YET
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "rounded-full outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label="Account menu"
          >
            <AvatarBubble name={displayName} src={avatarUrl} size={36} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem render={<Link href="/profile" />}>
              <Settings className="size-4" />
              Profile &amp; settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
