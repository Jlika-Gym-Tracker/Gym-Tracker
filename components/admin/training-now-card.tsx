"use client";

import { useState } from "react";
import { Card } from "@/components/kit/card";
import { AsyncButton } from "@/components/kit/async-button";
import { Message } from "@/components/profile/controls";
import { refreshTrainingNow } from "@/app/actions/admin";
import { formatClock, formatElapsed } from "@/lib/admin/format";
import type { TrainingNow } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

/**
 * Accounts with a session open from the last four hours.
 *
 * PRIVACY BOUNDARY: an email and how long — not the day they are on, the
 * exercise, or how far through they are. Refreshed on demand rather than
 * polled, so the page does not sit there watching people.
 */
export function TrainingNowCard({ initial }: { initial: TrainingNow }) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string>();

  async function refresh() {
    const result = await refreshTrainingNow();
    if (result.ok) {
      setState(result.data);
      setError(undefined);
    } else {
      setError(result.error);
    }
  }

  const asOf = new Date(state.asOf).getTime();
  const live = state.rows.length > 0;

  return (
    <Card className={cn(live && "border-line-hi")}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn("size-2 flex-none rounded-full", live ? "bg-accent" : "bg-fg-faint")}
        />
        <h2 className="text-[15px] font-bold">Training now</h2>
        <span className="font-mono text-[11px] text-fg-dim">{state.rows.length}</span>
        <AsyncButton
          action={refresh}
          className="hit ml-auto inline-flex items-center gap-1.5 rounded-[10px] border border-stroke bg-ghost px-3 py-2 text-[12px] font-semibold text-fg-2 hover:bg-hover disabled:opacity-60"
        >
          Refresh
        </AsyncButton>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-[1.5] text-fg-dim">
        Open sessions started in the last 4 hours · as of {formatClock(state.asOf)}
      </p>

      {error ? (
        <div className="mt-3">
          <Message error={error} />
        </div>
      ) : null}

      {live ? (
        <ul className="mt-3 flex flex-col">
          {state.rows.map((row) => (
            <li
              key={`${row.email}-${row.startedAt}`}
              className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2" title={row.email}>
                {row.email}
              </span>
              <span className="flex-none font-mono text-[12px] font-bold text-accent">
                {formatElapsed(asOf - new Date(row.startedAt).getTime())}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-[12px] border border-line bg-surface-2 px-3.5 py-3 text-[12.5px] text-fg-soft">
          Nobody is mid-session.
        </p>
      )}
    </Card>
  );
}
