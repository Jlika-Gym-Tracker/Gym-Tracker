"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createSeason, type ActionState } from "@/app/actions/league";
import { Message } from "@/components/profile/controls";

export function NewSeasonPrompt() {
  const [state, create] = useActionState(createSeason, {} as ActionState);

  return (
    <div className="relative flex min-h-[300px] max-w-[860px] flex-col overflow-hidden rounded-[20px] border border-line bg-surface px-7 py-[26px]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-2 -bottom-[26px] leading-none font-extrabold tracking-[-0.06em] text-accent opacity-[0.07] select-none"
        style={{ fontSize: 150 }}
      >
        SEASON 1
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#101214f5_0%,#101214cc_45%,#10121444_100%)]"
      />

      <div className="relative flex flex-1 flex-col">
        <div className="w-fit rounded-md border border-line-hi bg-accent-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
          Crew league
        </div>
        <h1 className="display mt-4 mb-2 max-w-[520px] text-[38px]">
          Start a season and race your crew.
        </h1>
        <p className="max-w-[460px] text-[13.5px] leading-[1.55] text-fg-muted">
          Twelve weeks. Points for showing up, and for moving toward your own goal
          measured as a percentage — so a cut and a bulk compete fairly. Only points
          and percentages are ever visible to anyone else; your weight, measurements
          and photos never leave your account.
        </p>

        <form action={create} className="mt-auto flex flex-wrap items-center gap-2.5 pt-6">
          <input
            name="name"
            defaultValue="Season 1"
            aria-label="Season name"
            className="rounded-[11px] border border-line bg-surface-2 px-3.5 py-3 text-[13.5px] outline-none focus:border-line-hi"
          />
          <button
            type="submit"
            className="rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
          >
            Start a 12-week season
          </button>
          <Link
            href="/profile"
            className="rounded-[11px] border border-stroke bg-ghost px-5 py-[13px] text-sm font-semibold text-fg-2 hover:bg-hover"
          >
            Invite your crew first
          </Link>
        </form>
        <div className="relative mt-3">
          <Message error={state.error} notice={state.notice} />
        </div>
      </div>
    </div>
  );
}
