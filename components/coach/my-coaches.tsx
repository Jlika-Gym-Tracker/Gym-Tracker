"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { endCoachLink, joinCoach, setCoachSharing, type ActionState } from "@/app/actions/coach";
import type { MyCoach } from "@/lib/coach/queries";
import { Card } from "@/components/kit/card";
import { AvatarBubble } from "@/components/shell/avatar-bubble";
import { Field, Message, Toggle } from "@/components/profile/controls";

const SCOPES = [
  {
    key: "share_training" as const,
    label: "Training",
    detail: "Your program, which sessions you completed, and every set, load and RPE.",
  },
  {
    key: "share_body_metrics" as const,
    label: "Bodyweight & measurements",
    detail: "Weigh-ins, waist, and the rest of your measurements.",
  },
  {
    key: "share_photos" as const,
    label: "Progress photos",
    detail: "Your comparison photos. Off unless you deliberately turn it on.",
  },
  {
    key: "share_nutrition" as const,
    label: "Nutrition",
    detail: "Calorie targets and what you planned to eat.",
  },
];

/**
 * The athlete's side of coaching.
 *
 * Deliberately states what each coach can see rather than hiding it behind a
 * settings page — someone should never be unsure who is looking at their
 * weight or photos.
 */
export function MyCoaches({
  coaches,
  meId,
  coachingEnabled,
  needsBodySetup,
}: {
  coaches: MyCoach[];
  meId: string;
  coachingEnabled: boolean;
  needsBodySetup: boolean;
}) {
  const [joinState, join] = useActionState(joinCoach, {} as ActionState);
  const [endState, end] = useActionState(endCoachLink, {} as ActionState);
  const [, startTransition] = useTransition();
  const [local, setLocal] = useState(coaches);

  function toggle(coachId: string, key: (typeof SCOPES)[number]["key"], value: boolean) {
    setLocal((current) =>
      current.map((c) => (c.coach_id === coachId ? { ...c, [key]: value } : c)),
    );
    startTransition(() => void setCoachSharing(coachId, key, value));
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid gap-[18px] lg:grid-cols-[1fr_320px]">
        <Card>
          <h2 className="text-[15px] font-bold">Your coach</h2>
          <p className="mt-1 mb-4 text-[12.5px] leading-[1.5] text-fg-soft">
            A coach starts with your training only. Everything else stays private
            until you switch it on here, and switching it off takes effect at once.
          </p>

          {local.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-fg-dim">
              No coach linked. Enter a coach code to connect.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {local.map((coach) => (
                <div
                  key={coach.coach_id}
                  className="rounded-[14px] border border-line bg-surface-2 p-4"
                >
                  <div className="flex items-center gap-3">
                    <AvatarBubble name={coach.display_name} src={coach.avatar_url} size={36} />
                    <div>
                      <div className="text-[13.5px] font-semibold">{coach.display_name}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-fg-dim uppercase">
                        {coach.status}
                      </div>
                    </div>
                    <form action={end} className="ml-auto">
                      <input type="hidden" name="coachId" value={coach.coach_id} />
                      <input type="hidden" name="athleteId" value={meId} />
                      <button className="rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-[11.5px] font-semibold text-danger">
                        End coaching
                      </button>
                    </form>
                  </div>

                  <div className="mt-3 border-t border-[#1a1e20] pt-1">
                    {SCOPES.map((scope) => (
                      <Toggle
                        key={scope.key}
                        label={scope.label}
                        description={scope.detail}
                        checked={coach[scope.key]}
                        onChange={(value) => toggle(coach.coach_id, scope.key, value)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3">
            <Message error={endState.error} notice={endState.notice} />
          </div>
        </Card>

        <Card>
          <h2 className="text-[15px] font-bold">Join a coach</h2>
          <form action={join} className="mt-3 flex flex-col gap-2.5">
            <Field label="Coach code" name="code" placeholder="COACH-4M2XQ7" required />
            <Message error={joinState.error} notice={joinState.notice} />
            <button className="rounded-[11px] bg-accent px-4 py-3 text-[13px] font-bold text-[#0a0c0d] hover:bg-accent-hi">
              Join
            </button>
          </form>
          <p className="mt-3 text-[11.5px] leading-[1.5] text-fg-dim">
            Joining shares your training. Bodyweight, photos and nutrition stay
            hidden until you choose otherwise.
          </p>
        </Card>
      </div>

      <BecomeCoach enabled={coachingEnabled} needsBodySetup={needsBodySetup} />
    </div>
  );
}

/**
 * The only discoverable way into coaching.
 *
 * The Coach nav item in the sidebar appears once coaching_enabled is true — so
 * without this card, the switch that reveals the link could only be reached by
 * guessing the URL.
 */
function BecomeCoach({
  enabled,
  needsBodySetup,
}: {
  enabled: boolean;
  needsBodySetup: boolean;
}) {
  return (
    <Card className="flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-bold">
          {enabled ? "Your coaching" : "Coach other people here"}
        </h2>
        <p className="mt-1 max-w-[560px] text-[12.5px] leading-[1.5] text-fg-soft">
          {enabled
            ? "Write programs, invite athletes with a code, and assign a week to anyone on your roster."
            : "Write programs once and assign them to athletes who join with your code. It is the same account — your own training is untouched, and athletes decide what you can see."}
        </p>
        {enabled && needsBodySetup ? (
          <p className="mt-2 text-[11.5px] leading-[1.5] text-fg-dim">
            You skipped your own body details, so your Today, Body and Nutrition
            screens have nothing to work with.{" "}
            <Link href="/onboarding?again=1" className="text-accent hover:text-accent-hi">
              Set up your own training
            </Link>
            .
          </p>
        ) : null}
      </div>
      <Link
        href="/coach"
        className="rounded-[11px] bg-accent px-[18px] py-3 text-[13px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
      >
        {enabled ? "Open coach dashboard" : "Turn on coaching"}
      </Link>
    </Card>
  );
}
