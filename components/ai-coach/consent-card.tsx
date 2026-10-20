"use client";

import { useState } from "react";
import { setAiCoachConsent } from "@/app/actions/ai-coach";
import { Card } from "@/components/kit/card";
import { useAction } from "@/lib/use-action";
import { Bullet, Notice, Spinner, Tag, primaryButton } from "./ui";

/**
 * The first visit. Says exactly what leaves the server before anything does,
 * and nothing is sent until the button below is pressed. The list here is the
 * list lib/ai-coach/payload.ts builds from — keep the two in step.
 */
export function AiCoachConsent({
  model,
  dailyLimit,
  fixture,
}: {
  model: string;
  dailyLimit: number;
  fixture: boolean;
}) {
  const { pending, run } = useAction({ announce: "block", label: "Turning on the AI Coach" });
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="mx-auto max-w-[680px]">
      <Tag>AI Coach · optional</Tag>
      <h1 className="display mt-4 mb-2 text-[28px] lg:text-[32px]">A coach that drafts, you decide.</h1>
      <p className="max-w-[520px] text-[13.5px] leading-[1.55] text-fg-muted">
        The AI Coach can draft a training week from a short set of questions, and review the last four
        weeks of what you logged to suggest specific changes. It is off until you turn it on, and nothing
        in your program changes until you approve it — every apply keeps a snapshot you can revert.
      </p>

      <div className="mt-5 rounded-[14px] border border-line bg-surface-2 p-4">
        <div className="eyebrow mb-2.5">What is sent to Anthropic, when you run it</div>
        <ul className="flex flex-col gap-2 text-[12.5px] leading-[1.5]">
          <Bullet>Your training plan and the sets you logged — exercises, sets, reps, loads, times and effort.</Bullet>
          <Bullet>How sessions felt: the too easy / about right / brutal rating, and the notes you wrote.</Bullet>
          <Bullet>Your body weight entries and goal weight.</Bullet>
          <Bullet>
            Your intake answers — goal, experience, days, session length, equipment, limitations, likes and
            dislikes. Sex, age and height only if you tick the box that allows it.
          </Bullet>
          <Bullet off>
            <strong className="text-fg-soft">Never</strong> your email, name, profile photo, progress photos,
            meal plan or anything about your crew or coach.
          </Bullet>
        </ul>
      </div>

      <div className="mt-3 rounded-[14px] border border-line bg-surface-2 p-4 text-[12.5px] leading-[1.55] text-fg-muted">
        <div className="eyebrow mb-2.5">Who pays, and how much you can use</div>
        Requests go to Anthropic&apos;s {model === "fixture" ? "API" : <code className="font-mono text-fg-soft">{model}</code>}{" "}
        model on the API key of whoever runs this app — it costs them, not you. Each account gets{" "}
        {dailyLimit} runs in any 24 hours. Nothing is sent until you press a button that says it will be.
      </div>

      {fixture ? (
        <div className="mt-3">
          <Notice notice="Fixture mode: this server has no API key, so the AI Coach answers with canned replies and sends nothing anywhere." />
        </div>
      ) : null}

      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() =>
          run(async () => {
            setError(null);
            const result = await setAiCoachConsent(true);
            if (result.error) setError(result.error);
          })
        }
        className={`${primaryButton} mt-6 w-full sm:w-auto`}
      >
        <Spinner show={pending} />
        {pending ? "Turning on…" : "Turn on the AI Coach"}
      </button>
      <p className="mt-2 text-[11.5px] text-fg-dim">You can turn it off again at any time, here.</p>
      {error ? (
        <div className="mt-3">
          <Notice error={error} />
        </div>
      ) : null}
    </Card>
  );
}
