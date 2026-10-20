"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowRight, Check } from "lucide-react";
import { applyReview, dismissProposal, runReview, type AiCoachResult } from "@/app/actions/ai-coach";
import { useAction } from "@/lib/use-action";
import type { ChangeView, ReviewView, WeekSlot } from "@/lib/ai-coach/view";
import { cn } from "@/lib/utils";
import { RunProgress } from "./run-progress";
import { Bullet, Notice, Spinner, Tag, ghostButton, primaryButton } from "./ui";
import { ReplaceConfirm, WeekTarget, type Target } from "./week-target";

const TYPE_LABEL: Record<ChangeView["type"], string> = {
  swap_exercise: "Swap",
  add_exercise: "Add",
  remove_exercise: "Remove",
  set_sets: "Sets",
  set_rep_range: "Rep range",
  set_target_seconds: "Time",
  set_load: "Load",
  set_progression: "Progression",
  set_superset: "Superset",
  rename_day: "Rename",
};

/** Asks for a review, then shows its changes to tick, and its advice. */
export function ReviewPanel({
  review,
  thisWeek,
  nextWeek,
  remaining,
  onDone,
}: {
  review: ReviewView | null;
  thisWeek: WeekSlot;
  nextWeek: WeekSlot;
  remaining: number;
  onDone: (notice: string) => void;
}) {
  const start = useAction();
  const [error, setError] = useState<string | null>(null);

  if (start.pending) return <RunProgress kind="review" />;
  if (review) return <ReviewResult review={review} thisWeek={thisWeek} nextWeek={nextWeek} onDone={onDone} />;

  return (
    <div className="rounded-[18px] border border-line bg-surface p-4 sm:p-5">
      <h2 className="text-[15px] font-bold">Review the last four weeks</h2>
      <p className="mt-1 max-w-[560px] text-[12.5px] leading-[1.55] text-fg-muted">
        The coach reads what actually happened against your current plan and suggests specific changes,
        each with the evidence behind it. You tick the ones you want; the rest are remembered so they
        aren&apos;t suggested again without new evidence.
      </p>
      <ul className="mt-3.5 flex flex-col gap-1.5 text-[12px] leading-[1.5]">
        <Bullet>Sets hit and missed against each day&apos;s targets, and sets skipped</Bullet>
        <Bullet>Effort (RPE) trends, and lifts that have stopped moving</Bullet>
        <Bullet>Planned days against sessions done, and session length against your answer</Bullet>
        <Bullet>Session ratings and notes, body weight against your goal, muscles that got no work</Bullet>
      </ul>
      <div className="mt-4 flex flex-col gap-2">
        <Notice error={error} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={start.pending || remaining <= 0}
            aria-busy={start.pending || undefined}
            onClick={() =>
              start.run(async () => {
                setError(null);
                const result = await runReview();
                if (result.error) setError(result.error);
                else if (result.notice) onDone(result.notice);
              })
            }
            className={primaryButton}
          >
            <Spinner show={start.pending} />
            Review my training
          </button>
          <p className="text-[11.5px] text-fg-dim">
            {remaining > 0 ? "Sends the summary above to Anthropic. Uses 1 run." : "You've used today's runs."}
          </p>
        </div>
      </div>
    </div>
  );
}

function ReviewResult({
  review,
  thisWeek,
  nextWeek,
  onDone,
}: {
  review: ReviewView;
  thisWeek: WeekSlot;
  nextWeek: WeekSlot;
  onDone: (notice: string) => void;
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  // The week the review read, if that is this week; otherwise an empty this
  // week before a full next one.
  const [target, setTarget] = useState<Target>(
    review.baseWeekStart === thisWeek.weekStart || thisWeek.exercises === 0 ? "this" : "next",
  );
  const [result, setResult] = useState<AiCoachResult>({});
  const apply = useAction({ announce: "block", label: "Applying changes" });
  const dismiss = useAction({ announce: "block", label: "Dismissing" });
  const busy = apply.pending || dismiss.pending;

  const finish = (outcome: AiCoachResult) => {
    if (outcome.notice && !outcome.error && !outcome.needsConfirm) onDone(outcome.notice);
    setResult(outcome.notice ? { ...outcome, notice: undefined } : outcome);
  };

  function save(confirm: boolean) {
    apply.run(async () => {
      setResult({});
      finish(await applyReview(review.proposalId, [...ticked], target, confirm));
    });
  }

  const none = review.changes.length === 0;
  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[18px] border border-line-hi bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={none ? "dim" : "accent"}>{none ? "No changes needed" : `${review.changes.length} suggested`}</Tag>
          <span className="font-mono text-[10.5px] text-fg-dim">
            Plan of {format(parseISO(review.baseWeekStart), "MMM d")} · {format(parseISO(review.createdAt), "MMM d, HH:mm")}
          </span>
        </div>
        <p className="mt-3 text-[13px] leading-[1.55] text-fg-muted">{review.summary}</p>
      </div>

      {!none ? (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="sr-only">Changes to apply</legend>
          <div className="flex items-center justify-between px-1">
            <span className="eyebrow">Tick what you want</span>
            <button
              type="button"
              onClick={() =>
                setTicked(ticked.size === review.changes.length ? new Set() : new Set(review.changes.map((c) => c.id)))
              }
              className="min-h-9 px-1 font-mono text-[10.5px] font-semibold text-accent uppercase"
            >
              {ticked.size === review.changes.length ? "Untick all" : "Tick all"}
            </button>
          </div>
          {review.changes.map((change) => (
            <ChangeRow key={change.id} change={change} checked={ticked.has(change.id)} onToggle={() => toggle(change.id)} />
          ))}
        </fieldset>
      ) : null}

      {review.advice.length ? (
        <div className="rounded-[18px] border border-line bg-surface p-4 sm:p-5">
          <div className="eyebrow mb-2.5">Notes · these change nothing</div>
          <ul className="flex flex-col gap-2 text-[12.5px] leading-[1.55]">
            {review.advice.map((note, i) => (
              <Bullet key={i}>{note}</Bullet>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-[18px] border border-line bg-surface p-4 sm:p-5">
        {!none ? (
          <>
            <div className="eyebrow mb-2.5">Apply to</div>
            <WeekTarget value={target} onChange={setTarget} thisWeek={thisWeek} nextWeek={nextWeek} />
          </>
        ) : null}
        <div className={cn("flex flex-col gap-3", !none && "mt-3")}>
          <Notice error={result.error} />
          {result.needsConfirm ? (
            <ReplaceConfirm
              {...result.needsConfirm}
              pending={apply.pending}
              onConfirm={() => save(true)}
              onCancel={() => setResult({})}
            />
          ) : null}
        </div>
        <div className={cn("flex flex-wrap gap-2", (result.error || result.needsConfirm || !none) && "mt-3")}>
          {!none ? (
            <button
              type="button"
              disabled={busy || ticked.size === 0}
              aria-busy={apply.pending || undefined}
              onClick={() => save(false)}
              className={primaryButton}
            >
              <Spinner show={apply.pending} />
              {ticked.size ? `Apply ${ticked.size} change${ticked.size === 1 ? "" : "s"}` : "Tick a change to apply"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            aria-busy={dismiss.pending || undefined}
            onClick={() =>
              dismiss.run(async () => {
                finish(await dismissProposal(review.proposalId));
              })
            }
            className={ghostButton}
          >
            <Spinner show={dismiss.pending} />
            {none ? "Done" : "Dismiss all"}
          </button>
        </div>
        {!none ? (
          <p className="mt-2 text-[11.5px] leading-[1.5] text-fg-dim">
            Unticked changes are recorded as turned down. A snapshot is kept first, so History can revert this.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ChangeRow({ change, checked, onToggle }: { change: ChangeView; checked: boolean; onToggle: () => void }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-[16px] border p-3.5 transition-colors sm:p-4",
        checked ? "border-line-sel bg-accent-soft" : "border-line bg-surface hover:border-stroke",
      )}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="peer sr-only" />
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-5 flex-none items-center justify-center rounded-[6px] border peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
          checked ? "border-accent bg-accent text-[#0a0c0d]" : "border-stroke bg-surface-2",
        )}
      >
        {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-[0.08em] text-fg-soft uppercase">
            {TYPE_LABEL[change.type]}
          </span>
          <span className="min-w-0 text-[12px] font-semibold text-fg-2">{change.target}</span>
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
          <span className="text-fg-dim line-through decoration-fg-faint">{change.before}</span>
          <ArrowRight className="size-3.5 flex-none text-fg-dim" role="img" aria-label="becomes" />
          <span className="font-semibold text-accent">{change.after}</span>
        </span>
        <span className="mt-1.5 block text-[12px] leading-[1.5] text-fg-muted">{change.rationale}</span>
      </span>
    </label>
  );
}
