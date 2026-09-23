"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { COACH_GROUP, NAV_GROUPS, isActivePath } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { AvatarBubble } from "./avatar-bubble";
import { NavSpinner } from "./nav-spinner";

export type SidebarSummary = {
  /** e.g. "Week 12 · Cut" */
  eyebrow: string;
  /** Big number, already unit-converted. Null when there is nothing to show yet. */
  value: string | null;
  caption: string;
  /** 0–1, drives the little bar. */
  progress: number;
};

export function Sidebar({
  displayName,
  avatarUrl,
  goalLine,
  summary,
  coaching = false,
}: {
  displayName: string;
  avatarUrl: string | null;
  goalLine: string;
  summary: SidebarSummary;
  coaching?: boolean;
}) {
  const pathname = usePathname();
  const groups = coaching ? [...NAV_GROUPS, COACH_GROUP] : NAV_GROUPS;

  return (
    // Desktop only — a 216px column leaves a phone 114px of content. Phones get
    // MobileNav along the bottom instead.
    <aside className="sticky top-0 hidden h-svh w-[216px] flex-none flex-col gap-[26px] border-r border-rule bg-sidebar-bg px-4 py-[22px] lg:flex">
      <Link href="/" className="px-1.5">
        <Logo />
      </Link>

      {groups.map((group) => (
        <nav key={group.title} className="flex flex-col gap-[3px]">
          <div className="eyebrow px-2 pb-2 tracking-[0.14em]">{group.title}</div>
          {group.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-[11px] rounded-[10px] px-2.5 py-[9px] transition-colors",
                  active ? "bg-accent-soft" : "hover:bg-hover",
                )}
              >
                <span
                  className={cn(
                    "size-[7px] flex-none rounded-[2px]",
                    active ? "bg-accent" : "bg-[#2f3639]",
                  )}
                />
                <span
                  className={cn(
                    "text-[13.5px]",
                    active ? "font-bold text-fg" : "font-medium text-fg-muted",
                  )}
                >
                  {item.label}
                </span>
                <NavSpinner className="ml-auto text-accent" />
                {item.meta ? (
                  <span className="ml-auto font-mono text-[10px] font-medium text-fg-dim">
                    {item.meta}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      ))}

      <div className="mt-auto flex flex-col gap-3">
        <div className="rounded-[14px] border border-line bg-surface p-3.5">
          <div className="eyebrow mb-2">{summary.eyebrow}</div>
          {summary.value ? (
            <div className="flex items-baseline gap-[5px]">
              <div className="text-[22px] font-extrabold tracking-[-0.03em]">
                {summary.value}
              </div>
              <div className="text-xs text-fg-soft">{summary.caption}</div>
            </div>
          ) : (
            <div className="text-xs leading-[1.5] text-fg-soft">
              {summary.caption}
            </div>
          )}
          <div className="mt-2.5 h-[5px] overflow-hidden rounded-[3px] bg-line">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${Math.round(summary.progress * 100)}%` }}
            />
          </div>
        </div>

        <Link
          href="/profile"
          className={cn(
            "flex items-center gap-2.5 rounded-[10px] px-1.5 py-2 transition-colors",
            pathname.startsWith("/profile") ? "bg-accent-soft" : "hover:bg-hover",
          )}
        >
          <AvatarBubble name={displayName} src={avatarUrl} size={32} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold">{displayName}</div>
            <div className="truncate font-mono text-[10.5px] text-fg-dim uppercase">
              {goalLine}
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
