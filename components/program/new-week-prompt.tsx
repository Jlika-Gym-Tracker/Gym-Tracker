"use client";

import { useActionState } from "react";
import { copyLastWeek, createCurrentWeek, type ActionState } from "@/app/actions/program";
import { weekRangeLabel } from "@/lib/dates";

/** Shown when no week exists for the date being viewed. */
export function NewWeekPrompt({
  weekStart,
  hasEarlierWeek,
}: {
  weekStart: string;
  hasEarlierWeek: boolean;
}) {
  const [createState, create] = useActionState(
    async () => createCurrentWeek(),
    {} as ActionState,
  );
  const [copyState, copy] = useActionState(copyLastWeek, {} as ActionState);
  const error = createState.error ?? copyState.error;

  return (
    <div className="relative flex min-h-[268px] max-w-[860px] flex-col overflow-hidden rounded-[20px] border border-line bg-surface px-7 py-[26px]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-1.5 -bottom-[22px] leading-none font-extrabold tracking-[-0.06em] text-accent opacity-[0.07] select-none"
        style={{ fontSize: 150 }}
      >
        WEEK
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#101214f5_0%,#101214cc_50%,#10121455_100%)]"
      />

      <div className="relative flex flex-1 flex-col">
        <div className="w-fit rounded-md border border-line-hi bg-accent-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
          {weekRangeLabel(weekStart)}
        </div>
        <h1 className="display mt-4 mb-2 max-w-[460px] text-[38px]">
          Nothing written for this week yet.
        </h1>
        <p className="max-w-[440px] text-[13.5px] leading-[1.5] text-fg-muted">
          Start blank and build it day by day, paste it as plain text, or duplicate
          the last week you wrote. Nothing is generated for you.
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-6">
          <form action={create}>
            <button
              type="submit"
              className="rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi"
            >
              Start this week
            </button>
          </form>
          {hasEarlierWeek ? (
            <form action={copy}>
              <input type="hidden" name="weekStart" value={weekStart} />
              <button
                type="submit"
                className="rounded-[11px] border border-stroke bg-ghost px-5 py-[13px] text-sm font-semibold text-fg-2 transition-colors hover:bg-hover"
              >
                Copy last week
              </button>
            </form>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 w-fit rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
