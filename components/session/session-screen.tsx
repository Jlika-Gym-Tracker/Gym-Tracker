"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import {
  addSet,
  addExerciseToSession,
  discardSession,
  finishSession,
  removeSet,
  saveSet,
  type ActionState,
} from "@/app/actions/session";
import type { SessionDetail, SessionExercise } from "@/lib/training/queries";
import type { UnitSystem } from "@/lib/database.types";
import { bestSet, setOneRepMax, totalVolume } from "@/lib/training/e1rm";
import { formatVolume, weightUnit } from "@/lib/units";
import { ExerciseThumb } from "@/components/program/exercise-thumb";
import { cn } from "@/lib/utils";
import { ElapsedClock, RestTimer, useRestTimer } from "./timers";
import { SetRow, draftToPayload, toDraft, type SetDraft } from "./set-row";
import { ExerciseDrawer, type DrawerData } from "./exercise-drawer";
import { SidePanel, type SidePanelData } from "./side-panel";

export function SessionScreen({
  session,
  system,
  restSeconds,
  panels,
  shortcutsEnabled = true,
}: {
  session: SessionDetail;
  system: UnitSystem;
  restSeconds: number;
  /** Per-exercise history and progression hint, computed on the server. */
  panels: Record<string, SidePanelData>;
  shortcutsEnabled?: boolean;
}) {
  const unit = weightUnit(system);
  const [pending, startTransition] = useTransition();
  const [drawer, setDrawer] = useState<DrawerData | null>(null);
  const [focusId, setFocusId] = useState<string | null>(
    session.exercises[0]?.exercise.id ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const rest = useRestTimer(restSeconds);

  const [finishState, finish] = useActionState(finishSession, {} as ActionState);
  const [discardState, discard] = useActionState(discardSession, {} as ActionState);

  // Optimistic set state, keyed by set-log id. The server is the source of
  // truth; this only keeps typing and ticking from feeling laggy.
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>(() => {
    const initial: Record<string, SetDraft> = {};
    for (const ex of session.exercises) {
      for (const set of ex.sets) initial[set.id] = toDraft(set, system);
    }
    return initial;
  });

  const draftFor = useCallback(
    (id: string, fallback: SetDraft) => drafts[id] ?? fallback,
    [drafts],
  );

  const commit = useCallback(
    (id: string, draft: SetDraft) => {
      setError(null);
      startTransition(async () => {
        const result = await saveSet({ id, ...draftToPayload(draft, system) });
        if (result.error) setError(result.error);
      });
    },
    [system],
  );

  function toggle(id: string, draft: SetDraft) {
    const next = { ...draft, isComplete: !draft.isComplete };
    if (next.isComplete && !next.reps.trim()) {
      setError("Add reps before ticking the set off.");
      return;
    }
    setDrafts((prev) => ({ ...prev, [id]: next }));
    if (next.isComplete) rest.start();
    commit(id, next);
  }

  // Running totals read from the optimistic drafts so they move as you tick.
  const totals = useMemo(() => {
    const completed = session.exercises.flatMap((ex) =>
      ex.sets
        .map((set) => draftFor(set.id, toDraft(set, system)))
        .filter((d) => d.isComplete)
        .map((d) => ({
          weight_kg: d.weight === "" ? null : Number(d.weight),
          reps: d.reps === "" ? null : Number(d.reps),
          rpe: null,
        })),
    );
    const planned = session.exercises.reduce(
      (n, ex) => n + (ex.plan?.target_sets ?? ex.sets.length),
      0,
    );
    return {
      done: completed.length,
      planned,
      // Drafts are already in display units, so this total is too.
      volume: totalVolume(completed),
    };
  }, [session.exercises, draftFor, system]);

  // Keyboard shortcuts. Held in a ref so the listener does not need rebinding
  // every keystroke, and ignored while a field has focus — space belongs to the
  // input you are typing in.
  const shortcutState = useRef({ toggle, rest, exercises: session.exercises, drafts });
  shortcutState.current = { toggle, rest, exercises: session.exercises, drafts };

  useEffect(() => {
    if (!shortcutsEnabled) return;

    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      const current = shortcutState.current;

      if (event.key === " ") {
        // Tick off the first set that is not done yet.
        for (const ex of current.exercises) {
          for (const set of ex.sets) {
            const draft = current.drafts[set.id] ?? toDraft(set, system);
            if (!draft.isComplete) {
              event.preventDefault();
              current.toggle(set.id, draft);
              return;
            }
          }
        }
        return;
      }

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        current.rest.start();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcutsEnabled, system]);

  const message = error ?? finishState.error ?? discardState.error;
  const focus = session.exercises.find((e) => e.exercise.id === focusId) ?? session.exercises[0];

  return (
    <>
      <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_372px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4 rounded-[18px] border border-line bg-surface px-5 py-[18px]">
            <Stat label="Elapsed">
              <ElapsedClock startedAt={session.started_at} />
            </Stat>
            <Divider />
            <Stat label="Sets done">
              <span className="font-mono text-2xl font-extrabold tracking-[-0.02em]">
                {totals.done}
                <span className="text-fg-dim">/{totals.planned}</span>
              </span>
            </Stat>
            <Divider />
            <Stat label={`Volume (${unit})`}>
              <span className="font-mono text-2xl font-extrabold tracking-[-0.02em]">
                {totals.volume > 0 ? formatVolume(totals.volume, "metric") : "0"}
              </span>
            </Stat>

            <div className="ml-auto flex items-center gap-2.5">
              <RestTimer
                seconds={restSeconds}
                running={rest.running}
                remaining={rest.remaining}
                onToggle={rest.toggle}
              />
              {totals.done === 0 ? (
                <form action={discard}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button
                    type="submit"
                    className="rounded-[11px] border border-stroke bg-ghost px-[18px] py-3 text-[13.5px] font-semibold text-fg-2 hover:bg-hover"
                  >
                    Discard
                  </button>
                </form>
              ) : (
                <form action={finish}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button
                    type="submit"
                    className="rounded-[11px] bg-accent px-[18px] py-3 text-[13.5px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
                  >
                    Finish
                  </button>
                </form>
              )}
            </div>

            {message ? (
              <p className="w-full rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
                {message}
              </p>
            ) : null}

            {shortcutsEnabled ? (
              <p className="w-full font-mono text-[10px] text-fg-dim uppercase">
                Space completes the next set · R restarts rest
              </p>
            ) : null}
          </div>

          {session.exercises.length === 0 ? (
            <div className="rounded-[18px] border border-line bg-surface px-5 py-10 text-center">
              <p className="text-[13.5px] text-fg-muted">
                This session has no exercises yet. Add one from the panel to start logging.
              </p>
            </div>
          ) : null}

          {session.exercises.map((ex) => (
            <ExerciseCard
              key={ex.exercise.id}
              ex={ex}
              unit={unit}
              system={system}
              focused={ex.exercise.id === focusId}
              pending={pending}
              draftFor={draftFor}
              onFocus={() => setFocusId(ex.exercise.id)}
              onChange={(id, d) => setDrafts((prev) => ({ ...prev, [id]: d }))}
              onCommit={commit}
              onToggle={toggle}
              onRemove={(id) => startTransition(() => void removeSet(id))}
              onAddSet={() => startTransition(() => void addSet(session.id, ex.exercise.id))}
              bestEver={panels[ex.exercise.id]?.bestEver ?? null}
              onOpenDrawer={() =>
                setDrawer({
                  exercise: ex.exercise,
                  plan: ex.plan,
                  best: panels[ex.exercise.id]?.bestEver ?? null,
                })
              }
            />
          ))}
        </div>

        {focus ? (
          <SidePanel
            exercise={focus.exercise}
            data={panels[focus.exercise.id]}
            system={system}
            onOpenDrawer={() =>
              setDrawer({
                exercise: focus.exercise,
                plan: focus.plan,
                best: panels[focus.exercise.id]?.bestEver ?? null,
              })
            }
            onAddExercise={(exerciseId) =>
              startTransition(() => void addExerciseToSession(session.id, exerciseId))
            }
          />
        ) : null}
      </div>

      <ExerciseDrawer data={drawer} system={system} onClose={() => setDrawer(null)} />
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="h-[38px] w-px bg-line" />;
}

function ExerciseCard({
  ex,
  unit,
  system,
  focused,
  pending,
  bestEver,
  draftFor,
  onFocus,
  onChange,
  onCommit,
  onToggle,
  onRemove,
  onAddSet,
  onOpenDrawer,
}: {
  ex: SessionExercise;
  unit: string;
  system: UnitSystem;
  focused: boolean;
  pending: boolean;
  bestEver: { weight_kg: number | null; reps: number | null } | null;
  draftFor: (id: string, fallback: SetDraft) => SetDraft;
  onFocus: () => void;
  onChange: (id: string, draft: SetDraft) => void;
  onCommit: (id: string, draft: SetDraft) => void;
  onToggle: (id: string, draft: SetDraft) => void;
  onRemove: (id: string) => void;
  onAddSet: () => void;
  onOpenDrawer: () => void;
}) {
  const target = ex.plan
    ? ex.plan.rep_min == null
      ? `${ex.plan.target_sets} SETS`
      : `${ex.plan.target_sets} × ${ex.plan.rep_min}${
          ex.plan.rep_max && ex.plan.rep_max !== ex.plan.rep_min ? `-${ex.plan.rep_max}` : ""
        }${ex.plan.per_side ? " /SIDE" : ""}`
    : "EXTRA";

  // A PR is beating your previous best for this movement — not merely being
  // the best set of today, which would badge something on every exercise.
  const previousBest = bestEver ? setOneRepMax(bestEver) : 0;
  const todayBest = bestSet(
    ex.sets.map((s) => ({
      weight_kg: s.weight_kg == null ? null : Number(s.weight_kg),
      reps: s.reps,
      rpe: s.rpe == null ? null : Number(s.rpe),
      id: s.id,
    })),
  );
  const isPrSet = (setId: string, complete: boolean) =>
    complete &&
    todayBest?.id === setId &&
    setOneRepMax(todayBest) > previousBest &&
    previousBest > 0;

  return (
    <section
      onFocusCapture={onFocus}
      onClick={onFocus}
      className={cn(
        "overflow-hidden rounded-[18px] border bg-surface transition-colors",
        focused ? "border-line-hi" : "border-line",
        pending && "opacity-95",
      )}
    >
      <header
        className={cn(
          "flex items-center gap-3.5 px-5 py-4",
          focused ? "bg-done" : "bg-transparent",
        )}
      >
        <button type="button" onClick={onOpenDrawer} aria-label={`How to do ${ex.exercise.name}`}>
          <ExerciseThumb
            src={ex.exercise.image_start_url}
            muscle={ex.exercise.primary_muscle}
            size={44}
            className="rounded-[11px]"
          />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-bold tracking-[-0.01em]">
              {ex.exercise.name}
            </h2>
            <span className="flex-none font-mono text-[10px] font-medium text-fg-dim">
              {target}
            </span>
          </div>
          {ex.plan?.note ? (
            <p className="mt-0.5 text-[11.5px] text-fg-soft">{ex.plan.note}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onOpenDrawer}
          className="ml-auto flex-none font-mono text-[11px] font-semibold text-accent hover:text-accent-hi"
        >
          HOW TO →
        </button>
      </header>

      <div className="px-5 pt-1.5 pb-4">
        <div className="grid grid-cols-[36px_1fr_1fr_84px_40px_28px] gap-2.5 py-2.5 font-mono text-[10px] font-medium tracking-[0.1em] text-fg-dim uppercase">
          <div>Set</div>
          <div>{unit}</div>
          <div>Reps</div>
          <div>RPE</div>
          <div />
          <div />
        </div>

        {ex.sets.map((set, i) => {
          const fallback = toDraft(set, system);
          const draft = draftFor(set.id, fallback);
          return (
            <SetRow
              key={set.id}
              index={i}
              draft={draft}
              isPr={isPrSet(set.id, draft.isComplete)}
              onChange={(next) => onChange(set.id, next)}
              onCommit={() => onCommit(set.id, draftFor(set.id, fallback))}
              onToggle={() => onToggle(set.id, draft)}
              onRemove={() => onRemove(set.id)}
            />
          );
        })}

        <button
          type="button"
          onClick={onAddSet}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-stroke py-2 text-xs font-semibold text-fg-dim transition-colors hover:border-accent hover:text-accent"
        >
          <Plus className="size-3.5" strokeWidth={2} />
          Add a set
        </button>
      </div>
    </section>
  );
}
