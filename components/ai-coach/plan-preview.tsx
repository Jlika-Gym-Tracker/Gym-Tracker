"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Link2 } from "lucide-react";
import { acceptPlan, dismissProposal, refinePlan, type AiCoachResult } from "@/app/actions/ai-coach";
import { POLICY_SHORT } from "@/lib/program/policies";
import { useAction } from "@/lib/use-action";
import { formatSeconds } from "@/lib/ai-coach/changes";
import type { PlannedExercise } from "@/lib/ai-coach/plan";
import type { PlanView, WeekSlot } from "@/lib/ai-coach/view";
import { cn } from "@/lib/utils";
import { RunProgress } from "./run-progress";
import { Notice, Spinner, Tag, fieldClass, ghostButton, primaryButton } from "./ui";
import { ReplaceConfirm, WeekTarget, type Target } from "./week-target";

/**
 * The drafted week, before anything is saved. Accept writes it as a draft;
 * refine sends a plain-language request and gets a whole revised week back.
 */
export function PlanPreview({
  plan,
  dayLabels,
  thisWeek,
  nextWeek,
  remaining,
  onDone,
}: {
  plan: PlanView;
  dayLabels: string[];
  thisWeek: WeekSlot;
  nextWeek: WeekSlot;
  remaining: number;
  /** A finished action's notice, shown by the screen once this draft is gone. */
  onDone: (notice: string) => void;
}) {
  const [target, setTarget] = useState<Target>(thisWeek.exercises > 0 && nextWeek.exercises === 0 ? "next" : "this");
  const [request, setRequest] = useState("");
  const [result, setResultState] = useState<AiCoachResult>({});
  const setResult = (next: AiCoachResult) => {
    if (next.notice && !next.error && !next.needsConfirm) onDone(next.notice);
    setResultState(next.notice ? { ...next, notice: undefined } : next);
  };
  const refine = useAction();
  const accept = useAction({ announce: "block", label: "Saving the draft" });
  const dismiss = useAction({ announce: "block", label: "Dismissing" });
  const busy = refine.pending || accept.pending || dismiss.pending;

  if (refine.pending) return <RunProgress kind="refine" />;

  function save(confirm: boolean) {
    accept.run(async () => {
      setResult({});
      setResult(await acceptPlan(plan.proposalId, target, confirm));
    });
  }

  const training = plan.days.filter((d) => !d.is_rest).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[18px] border border-line-hi bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Tag>{plan.refined ? "Revised draft" : "Draft"} · not saved</Tag>
          <span className="font-mono text-[10.5px] text-fg-dim">
            {training} D/WK · {format(parseISO(plan.createdAt), "MMM d, HH:mm")}
          </span>
        </div>
        <h2 className="display mt-3 text-[24px]">{plan.label}</h2>
        <p className="mt-1.5 text-[13px] leading-[1.55] text-fg-muted">{plan.summary}</p>
      </div>

      <ol className="flex flex-col gap-2.5">
        {plan.days.map((day) => (
          <li
            key={day.day_index}
            className={cn("rounded-[16px] border border-line bg-surface", day.is_rest ? "px-4 py-3" : "p-4")}
          >
            <div className="flex items-baseline gap-2.5">
              <span className="w-9 flex-none font-mono text-[10.5px] font-bold tracking-[0.08em] text-fg-dim uppercase">
                {dayLabels[day.day_index]}
              </span>
              <span className={cn("min-w-0 flex-1 truncate text-[13.5px] font-bold", day.is_rest && "font-semibold text-fg-dim")}>
                {day.name}
              </span>
              {!day.is_rest ? (
                <span className="flex-none font-mono text-[10px] text-fg-dim uppercase">{POLICY_SHORT[day.progression]}</span>
              ) : null}
            </div>
            {day.focus_note && !day.is_rest ? (
              <p className="mt-1 pl-[46px] text-[12px] leading-[1.5] text-fg-soft">{day.focus_note}</p>
            ) : null}
            {day.exercises.length ? (
              <ul className="mt-3 flex flex-col gap-2 sm:pl-[46px]">
                {day.exercises.map((exercise, i) => (
                  <ExerciseRow key={`${exercise.slug}-${i}`} exercise={exercise} />
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="rounded-[18px] border border-line bg-surface p-4 sm:p-5">
        <div className="eyebrow mb-2">Not quite right?</div>
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="e.g. swap squats for split squats, Mondays are short"
          aria-label="What should change"
          className={fieldClass}
        />
        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={busy || request.trim().length < 3 || remaining <= 0}
            aria-busy={refine.pending || undefined}
            onClick={() =>
              refine.run(async () => {
                setResult({});
                const outcome = await refinePlan(plan.proposalId, request);
                setResult(outcome);
                if (!outcome.error) setRequest("");
              })
            }
            className={ghostButton}
          >
            <Spinner show={refine.pending} />
            Revise the week
          </button>
          <p className="text-[11.5px] text-fg-dim">Returns a whole new draft. Uses 1 run.</p>
        </div>
      </div>

      <div className="rounded-[18px] border border-line bg-surface p-4 sm:p-5">
        <div className="eyebrow mb-2.5">Save it as a draft in</div>
        <WeekTarget value={target} onChange={setTarget} thisWeek={thisWeek} nextWeek={nextWeek} />

        <div className="mt-3 flex flex-col gap-3">
          <Notice error={result.error} notice={result.notice} />
          {result.needsConfirm ? (
            <ReplaceConfirm
              {...result.needsConfirm}
              pending={accept.pending}
              onConfirm={() => save(true)}
              onCancel={() => setResult({})}
            />
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            aria-busy={accept.pending || undefined}
            onClick={() => save(false)}
            className={primaryButton}
          >
            <Spinner show={accept.pending} />
            Save as draft
          </button>
          <button
            type="button"
            disabled={busy}
            aria-busy={dismiss.pending || undefined}
            onClick={() =>
              dismiss.run(async () => {
                setResult(await dismissProposal(plan.proposalId));
              })
            }
            className={ghostButton}
          >
            <Spinner show={dismiss.pending} />
            Dismiss
          </button>
        </div>
        <p className="mt-2 text-[11.5px] leading-[1.5] text-fg-dim">
          It lands as a draft — edit it in Program and publish when you&apos;re happy. Nothing is published for you.
        </p>
      </div>
    </div>
  );
}

function ExerciseRow({ exercise }: { exercise: PlannedExercise }) {
  const dose =
    exercise.target_seconds != null
      ? `${exercise.sets} × ${formatSeconds(exercise.target_seconds)}`
      : `${exercise.sets} × ${exercise.rep_min}${exercise.rep_max != null && exercise.rep_max !== exercise.rep_min ? `–${exercise.rep_max}` : ""}`;

  return (
    <li className="rounded-[12px] border border-line bg-surface-2 px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        {exercise.superset_group != null ? (
          <span
            title={`Superset ${exercise.superset_group}`}
            className="inline-flex flex-none items-center gap-0.5 rounded-md border border-line-hi bg-accent-soft px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-accent"
          >
            <Link2 className="size-2.5" aria-hidden />
            {exercise.superset_group}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-fg-2">{exercise.name}</span>
        <span className="flex-none font-mono text-[11px] text-fg-muted">
          {dose}
          {exercise.per_side ? " /side" : ""}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] leading-[1.5] text-fg-soft">{exercise.note}</p>
      {exercise.progression ? (
        <span className="mt-1.5 inline-block rounded-md border border-line px-1.5 py-0.5 font-mono text-[9.5px] text-fg-dim uppercase">
          {POLICY_SHORT[exercise.progression]} progression
        </span>
      ) : null}
    </li>
  );
}
