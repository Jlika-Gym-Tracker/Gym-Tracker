"use client";

import { useState, useTransition } from "react";
import { setCoaching } from "@/app/actions/coach";
import { Card } from "@/components/kit/card";
import { Message } from "@/components/profile/controls";

/** Coaching is a capability you switch on, not a separate kind of account. */
export function EnableCoaching() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="max-w-[640px]">
      <div className="w-fit rounded-md border border-line-hi bg-accent-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
        Coaching
      </div>
      <h1 className="display mt-4 mb-2 text-[32px]">Coach other people here.</h1>
      <p className="max-w-[480px] text-[13.5px] leading-[1.55] text-fg-muted">
        Write programs once and assign them to athletes who join with your code.
        You keep your own training exactly as it is — coaching is a second hat on
        the same account, not a different login.
      </p>

      <div className="mt-5 rounded-[14px] border border-line bg-surface-2 p-4">
        <div className="eyebrow mb-2.5">What you will and won&apos;t see</div>
        <ul className="flex flex-col gap-2 text-[12.5px] leading-[1.5]">
          <li className="flex gap-2.5">
            <span className="mt-[6px] size-[6px] flex-none rounded-[2px] bg-accent" />
            <span className="text-fg-muted">
              Their program, which sessions they completed, and every set, load
              and RPE they logged.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-[6px] size-[6px] flex-none rounded-[2px] bg-fg-faint" />
            <span className="text-fg-dim">
              <strong className="text-fg-soft">Not</strong> their bodyweight,
              measurements, progress photos or meal plan — unless each athlete
              turns that on individually, and they can turn it off again at any
              moment.
            </span>
          </li>
        </ul>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setCoaching(true);
            if (result.error) setError(result.error);
          })
        }
        className="mt-6 rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi disabled:opacity-60"
      >
        {pending ? "Turning on…" : "Turn on coaching"}
      </button>
      <div className="mt-3">
        <Message error={error ?? undefined} />
      </div>
    </Card>
  );
}
