"use client";

import Link from "next/link";
import { useActionState } from "react";
import { joinCoach, type ActionState } from "@/app/actions/coach";
import { AvatarBubble } from "@/components/shell/avatar-bubble";
import { Message } from "@/components/profile/controls";

/**
 * The signed-in half of an invite link.
 *
 * Joining is a POST behind a button rather than something that happens on
 * opening the link: following a URL should never quietly hand someone your
 * training.
 */
export function JoinCoachCard({
  code,
  coachName,
  gymName,
  avatarUrl,
  reason,
}: {
  code: string;
  coachName: string | null;
  gymName: string | null;
  avatarUrl: string | null;
  reason: string;
}) {
  const [state, join] = useActionState(joinCoach, {} as ActionState);

  if (state.notice) {
    return (
      <>
        <h1 className="display text-[30px]">You&apos;re linked.</h1>
        <p className="mt-3 text-[13.5px] leading-[1.55] text-fg-muted">{state.notice}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/program"
            className="rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
          >
            See my program
          </Link>
          <Link
            href="/profile"
            className="rounded-[11px] border border-stroke bg-ghost px-[22px] py-[13px] text-sm font-semibold text-fg-muted hover:bg-hover"
          >
            Choose what they can see
          </Link>
        </div>
      </>
    );
  }

  if (reason !== "ok") {
    const problem: Record<string, string> = {
      unknown: "That code does not exist. Check it with your coach — codes look like COACH-4M2XQ7.",
      expired: "That code has expired. Ask your coach for a fresh one.",
      used_up: "That code has been used as many times as it allows. Ask your coach for a fresh one.",
      self: "That is your own coach code. Send it to an athlete instead.",
      already: `You are already coached by ${coachName ?? "them"}.`,
      error: "We could not check that code just now. Try again in a moment.",
    };
    return (
      <>
        <h1 className="display text-[30px]">
          {reason === "already" ? "Already linked." : "That code will not work."}
        </h1>
        <p className="mt-3 text-[13.5px] leading-[1.55] text-fg-muted">
          {problem[reason] ?? problem.unknown}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/profile"
            className="rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
          >
            {reason === "already" ? "Manage what they see" : "Enter a code by hand"}
          </Link>
          <Link
            href="/"
            className="rounded-[11px] border border-stroke bg-ghost px-[22px] py-[13px] text-sm font-semibold text-fg-muted hover:bg-hover"
          >
            Back to training
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="display text-[30px]">Train with {coachName}?</h1>

      <div className="mt-5 flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 p-4">
        <AvatarBubble name={coachName ?? "Coach"} src={avatarUrl} size={44} />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">{coachName}</div>
          <div className="mt-0.5 text-[12px] text-fg-dim">
            {gymName ?? "Independent coach"}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[14px] border border-line bg-surface-2 p-4">
        <div className="eyebrow mb-2.5">If you join</div>
        <ul className="flex flex-col gap-2 text-[12.5px] leading-[1.5]">
          <li className="flex gap-2.5">
            <span className="mt-[6px] size-[6px] flex-none rounded-[2px] bg-accent" />
            <span className="text-fg-muted">
              They can see your program, which sessions you finished, and every
              set, load and RPE you log. They can write your weeks for you.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-[6px] size-[6px] flex-none rounded-[2px] bg-fg-faint" />
            <span className="text-fg-dim">
              They <strong className="text-fg-soft">cannot</strong> see your
              bodyweight, measurements, progress photos or meals — not unless you
              switch each one on, and you can switch them off again at any time.
            </span>
          </li>
        </ul>
      </div>

      <form action={join} className="mt-6 flex flex-wrap items-center gap-3">
        <input type="hidden" name="code" value={code} />
        <button className="rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi">
          Join {coachName}
        </button>
        <Link
          href="/"
          className="rounded-[11px] border border-stroke bg-ghost px-[22px] py-[13px] text-sm font-semibold text-fg-muted hover:bg-hover"
        >
          Not now
        </Link>
      </form>
      <div className="mt-3">
        <Message error={state.error} />
      </div>
    </>
  );
}
