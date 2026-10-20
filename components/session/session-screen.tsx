"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
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
import type { EffortScale, Tracking, UnitSystem } from "@/lib/database.types";
import { bestSet, setOneRepMax, totalVolume } from "@/lib/training/e1rm";
import { formatVolume, kgToDisplay, distanceUnit, trimNumber, weightUnit } from "@/lib/units";
import { EFFORT_LABEL } from "@/lib/training/effort";
import { POLICY_SHORT } from "@/lib/program/policies";
import { ExerciseThumb } from "@/components/program/exercise-thumb";
import { cn } from "@/lib/utils";
import { Portal } from "@/components/kit/portal";
import { useAction } from "@/lib/use-action";
import { useWakeLock } from "@/lib/wake-lock";
import { chime, primeAudio } from "@/lib/sound";
import { ElapsedClock, RestTimer, useRestTimer, useTicker, type RestTimerState } from "./timers";
import {
  SetRow,
  draftToPayload,
  missingForTick,
  setGrid,
  toDraft,
  type RowMode,
  type SetDraft,
} from "./set-row";
import { ExerciseDrawer, type DrawerData } from "./exercise-drawer";
import { WeighIn } from "./weigh-in";
import { SidePanel, type SidePanelData } from "./side-panel";
import { ActionButton } from "@/components/kit/action-button";

export type SessionSettings = {
  restSeconds: number;
  /** Start the rest timer when a set is ticked off. */
  autoRest: boolean;
  shortcuts: boolean;
  /** Show an estimated 1RM on each card. */
  showE1rm: boolean;
  keepAwake: boolean;
  restSound: boolean;
  effortScale: EffortScale;
};

/** A timed set being held right now. */
type Work = { setId: string; exerciseId: string; startedAt: number; target: number | null };

/** Cards in display order: a movement alone, or a superset done back to back. */
type Block =
  | { kind: "single"; ex: SessionExercise }
  | { kind: "superset"; letter: string; members: SessionExercise[] };

function trackingOf(ex: SessionExercise): Tracking {
  return ex.exercise.tracking ?? "reps";
}

/**
 * Groups exercises that share a superset number, placed where the first of
 * them sits. Letters follow order of appearance so the first superset of the
 * day is always A, whatever number the builder stored.
 */
function toBlocks(exercises: SessionExercise[]): Block[] {
  const blocks: Block[] = [];
  const byGroup = new Map<number, Extract<Block, { kind: "superset" }>>();
  for (const ex of exercises) {
    const group = ex.plan?.superset_group;
    if (group == null) {
      blocks.push({ kind: "single", ex });
      continue;
    }
    const existing = byGroup.get(group);
    if (existing) {
      existing.members.push(ex);
      continue;
    }
    const block = {
      kind: "superset" as const,
      letter: String.fromCharCode(65 + byGroup.size),
      members: [ex],
    };
    byGroup.set(group, block);
    blocks.push(block);
  }
  // A "superset" of one is just an exercise.
  return blocks.map((b) =>
    b.kind === "superset" && b.members.length === 1 ? { kind: "single", ex: b.members[0]! } : b,
  );
}

export function SessionScreen({
  session,
  system,
  settings,
  panels,
  lastWeightKg = null,
}: {
  session: SessionDetail;
  system: UnitSystem;
  settings: SessionSettings;
  /** Per-exercise history, bests and prescription, computed on the server. */
  panels: Record<string, SidePanelData>;
  /** The latest weigh-in, to pre-fill the "weigh in first?" prompt. */
  lastWeightKg?: number | null;
}) {
  const unit = weightUnit(system);
  // Adding a set changes the list, so a repeated tap must not repeat the
  // write. Each set row guards its own tick and remove.
  const listEdit = useAction();
  const [drawer, setDrawer] = useState<DrawerData | null>(null);
  const [focusId, setFocusId] = useState<string | null>(
    session.exercises[0]?.exercise.id ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const rest = useRestTimer(settings.restSeconds, { sound: settings.restSound });
  useWakeLock(settings.keepAwake);

  const [finishState, finish] = useActionState(finishSession, {} as ActionState);
  const [discardState, discard] = useActionState(discardSession, {} as ActionState);

  const modeFor = useCallback(
    (ex: SessionExercise): RowMode => ({
      tracking: trackingOf(ex),
      effort: settings.effortScale,
      system,
    }),
    [settings.effortScale, system],
  );

  // Optimistic set state, keyed by set-log id. The server is the source of
  // truth; this only keeps typing and ticking from feeling laggy.
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>(() => {
    const initial: Record<string, SetDraft> = {};
    for (const ex of session.exercises) {
      for (const set of ex.sets) initial[set.id] = toDraft(set, modeFor(ex));
    }
    return initial;
  });

  const draftOf = useCallback(
    (ex: SessionExercise, set: SessionExercise["sets"][number]) =>
      drafts[set.id] ?? toDraft(set, modeFor(ex)),
    [drafts, modeFor],
  );

  // Awaited rather than fired into a transition, so the row that started the
  // write is the one that shows a spinner — and only that row.
  const commit = useCallback(
    async (ex: SessionExercise, id: string, draft: SetDraft) => {
      setError(null);
      const result = await saveSet({ id, ...draftToPayload(draft, modeFor(ex)) });
      if (result.error) setError(result.error);
    },
    [modeFor],
  );

  const blocks = useMemo(() => toBlocks(session.exercises), [session.exercises]);

  /**
   * Rest comes after a superset, not inside it: ticking set 2 of the first
   * movement goes straight to set 2 of the next. Once nothing later in the
   * group has that set still to do, the rest starts.
   */
  function restsAfter(ex: SessionExercise, setIndex: number) {
    const group = ex.plan?.superset_group;
    if (group == null) return true;
    const members = session.exercises.filter((e) => e.plan?.superset_group === group);
    const later = members.slice(members.findIndex((m) => m.exercise.id === ex.exercise.id) + 1);
    return !later.some((m) => {
      const set = m.sets[setIndex];
      return set != null && !draftOf(m, set).isComplete;
    });
  }

  async function complete(ex: SessionExercise, setId: string, setIndex: number, next: SetDraft) {
    setDrafts((prev) => ({ ...prev, [setId]: next }));
    if (next.isComplete && settings.autoRest && restsAfter(ex, setIndex)) rest.start();
    await commit(ex, setId, next);
  }

  async function toggle(ex: SessionExercise, setId: string, setIndex: number, draft: SetDraft) {
    const next = { ...draft, isComplete: !draft.isComplete };
    if (next.isComplete) {
      const missing = missingForTick(next, trackingOf(ex));
      if (missing) {
        setError(missing);
        return;
      }
    }
    await complete(ex, setId, setIndex, next);
  }

  // ---- the work clock for timed sets: counts up, chimes at the target, and
  // "stop" logs the time actually held and ticks the set.
  const [work, setWork] = useState<Work | null>(null);
  const workChimed = useRef(false);
  useTicker(work != null);
  const workElapsed = work ? Math.max(0, Math.floor((Date.now() - work.startedAt) / 1000)) : 0;

  useEffect(() => {
    if (!work || work.target == null || workChimed.current || workElapsed < work.target) return;
    workChimed.current = true;
    if (settings.restSound) chime();
  }, [work, workElapsed, settings.restSound]);

  function startWork(ex: SessionExercise, setId: string, target: number | null) {
    primeAudio();
    // Rest and work never run together: starting the hold ends the rest.
    if (rest.running) rest.skip();
    workChimed.current = false;
    setWork({ setId, exerciseId: ex.exercise.id, startedAt: Date.now(), target });
  }

  async function stopWork(ex: SessionExercise, setId: string, setIndex: number, draft: SetDraft) {
    if (!work) return;
    const held = Math.max(1, Math.floor((Date.now() - work.startedAt) / 1000));
    setWork(null);
    await complete(ex, setId, setIndex, { ...draft, duration: String(held), isComplete: true });
  }

  // Running totals read from the optimistic drafts so they move as you tick.
  const totals = useMemo(() => {
    let done = 0;
    const lifted: { weight_kg: number | null; reps: number | null }[] = [];
    for (const ex of session.exercises) {
      for (const set of ex.sets) {
        const d = draftOf(ex, set);
        if (!d.isComplete) continue;
        done++;
        if (trackingOf(ex) === "reps") {
          lifted.push({
            weight_kg: d.weight === "" ? null : Number(d.weight),
            reps: d.reps === "" ? null : Number(d.reps),
          });
        }
      }
    }
    const planned = session.exercises.reduce(
      (n, ex) => n + (ex.plan?.target_sets ?? ex.sets.length),
      0,
    );
    // Drafts are already in display units, so this total is too.
    return { done, planned, volume: totalVolume(lifted) };
  }, [session.exercises, draftOf]);

  // Keyboard shortcuts. Held in a ref so the listener does not need rebinding
  // every keystroke, and ignored while a field has focus — space belongs to the
  // input you are typing in.
  const shortcutState = useRef({ toggle, rest, exercises: session.exercises, draftOf });
  shortcutState.current = { toggle, rest, exercises: session.exercises, draftOf };

  useEffect(() => {
    if (!settings.shortcuts) return;

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
          for (const [i, set] of ex.sets.entries()) {
            const draft = current.draftOf(ex, set);
            if (!draft.isComplete) {
              event.preventDefault();
              void current.toggle(ex, set.id, i, draft);
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
  }, [settings.shortcuts]);

  const statsRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    // Pinned once the bar crosses a line 1px below its sticky top. Assumes the window scrolls.
    const top = parseFloat(getComputedStyle(el).top) || 0;
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(entry.intersectionRatio < 1),
      { rootMargin: `${-(top + 1)}px 0px 0px 0px`, threshold: 1 },
    );
    // Keeps focused fields and scrollIntoView targets clear of the bar and its fade.
    const html = document.documentElement;
    const resize = new ResizeObserver(() => {
      const fade = fadeRef.current?.offsetHeight ?? 0;
      html.style.scrollPaddingTop = `${top + el.offsetHeight + fade}px`;
    });
    observer.observe(el);
    resize.observe(el);
    return () => {
      observer.disconnect();
      resize.disconnect();
      html.style.removeProperty("scroll-padding-top");
    };
  }, []);

  const message = error ?? finishState.error ?? discardState.error;
  const focus = session.exercises.find((e) => e.exercise.id === focusId) ?? session.exercises[0];
  const actions = {
    sessionId: session.id,
    canFinish: totals.done > 0,
    restSeconds: settings.restSeconds,
    rest,
    finish,
    discard,
  };

  const openDrawer = (ex: SessionExercise) =>
    setDrawer({ exercise: ex.exercise, plan: ex.plan, best: panels[ex.exercise.id]?.best ?? null });

  const card = (ex: SessionExercise, superset?: string) => (
    <ExerciseCard
      key={ex.exercise.id}
      ex={ex}
      unit={unit}
      system={system}
      mode={modeFor(ex)}
      superset={superset}
      showE1rm={settings.showE1rm}
      focused={ex.exercise.id === focusId}
      draftOf={(set) => draftOf(ex, set)}
      panel={panels[ex.exercise.id]}
      work={work?.exerciseId === ex.exercise.id ? { ...work, elapsed: workElapsed } : null}
      // One clock at a time: a hold already running anywhere keeps the others' start buttons away.
      canStartWork={work == null}
      onFocus={() => setFocusId(ex.exercise.id)}
      onChange={(id, d) => setDrafts((prev) => ({ ...prev, [id]: d }))}
      onCommit={(id, d) => commit(ex, id, d)}
      onToggle={(id, i, d) => toggle(ex, id, i, d)}
      onStartWork={(id, target) => startWork(ex, id, target)}
      onStopWork={(id, i, d) => stopWork(ex, id, i, d)}
      onRemove={async (id) => void (await removeSet(id))}
      onAddSet={() => listEdit.run(() => addSet(session.id, ex.exercise.id))}
      addBusy={listEdit.pending}
      onOpenDrawer={() => openDrawer(ex)}
    />
  );

  return (
    <>
      <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_372px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div ref={statsRef} className="sticky top-0 z-30 -mt-4 bg-bg pt-4 lg:-mt-5 lg:pt-5">
            <div
              className={cn(
                "relative flex flex-wrap items-center gap-4 rounded-[18px] border border-line bg-surface px-4 py-3.5 transition-colors duration-300 lg:px-5 lg:py-[18px]",
                pinned && "border-stroke",
              )}
            >
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-x-6 -bottom-px h-px bg-linear-to-r from-transparent via-accent/60 to-transparent opacity-0 transition-opacity duration-500",
                  pinned && "opacity-100",
                )}
              />
              <div className="grid w-full grid-cols-3 gap-3 lg:flex lg:w-auto lg:items-center lg:gap-4">
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
              </div>

              {/* On a phone these move to the bar at the bottom of the screen. */}
              <div className="ml-auto hidden items-center gap-2.5 lg:flex">
                <SessionActions {...actions} />
              </div>

              {message ? (
                <p className="hidden w-full rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger lg:block">
                  {message}
                </p>
              ) : null}

              {/* Keyboard shortcuts mean nothing on a touchscreen. */}
              {settings.shortcuts ? (
                <p className="hidden w-full font-mono text-[10px] text-fg-dim uppercase pointer-fine:block">
                  Space completes the next set · R restarts rest
                </p>
              ) : null}
            </div>

            <div
              ref={fadeRef}
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-0 top-full h-8 bg-linear-to-b from-bg via-bg/70 to-transparent opacity-0 transition-opacity duration-300",
                pinned && "opacity-100",
              )}
            />
          </div>

          {/* Asked only before anything is ticked: half-way through a workout
              is not when anyone steps on a scale. */}
          {session.bodyweight_kg != null || totals.done === 0 ? (
            <WeighIn
              sessionId={session.id}
              system={system}
              current={session.bodyweight_kg == null ? null : Number(session.bodyweight_kg)}
              lastKg={lastWeightKg}
            />
          ) : null}

          {session.exercises.length === 0 ? (
            <div className="rounded-[18px] border border-line bg-surface px-5 py-10 text-center">
              <p className="text-[13.5px] text-fg-muted">
                This session has no exercises yet. Add one from the panel to start logging.
              </p>
            </div>
          ) : null}

          {blocks.map((block) =>
            block.kind === "single" ? (
              card(block.ex)
            ) : (
              <section
                key={`superset-${block.letter}`}
                aria-label={`Superset ${block.letter}`}
                className="flex flex-col gap-2.5 rounded-[20px] border border-line-hi bg-accent-soft/40 p-1.5"
              >
                <p className="px-3 pt-1.5 font-mono text-[10px] font-bold tracking-[0.12em] text-accent uppercase">
                  Superset {block.letter} · back to back, rest after the last
                </p>
                {block.members.map((ex) => card(ex, block.letter))}
              </section>
            ),
          )}
        </div>

        {focus ? (
          <SidePanel
            exercise={focus.exercise}
            data={panels[focus.exercise.id]}
            system={system}
            onOpenDrawer={() => openDrawer(focus)}
            onAddExercise={(exerciseId) =>
              listEdit.run(() => addExerciseToSession(session.id, exerciseId))
            }
          />
        ) : null}
      </div>

      {/* Phones: the tab bar is hidden during a live session and this takes
          its place, so resting and finishing are always under a thumb. */}
      <Portal>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-sidebar-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {message ? (
          <p className="mx-4 mt-2.5 rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
            {message}
          </p>
        ) : null}
        <div className="mx-auto flex h-16 max-w-[560px] items-center gap-2 px-4">
          <SessionActions {...actions} fill />
        </div>
      </div>
      </Portal>

      <ExerciseDrawer data={drawer} system={system} onClose={() => setDrawer(null)} />
    </>
  );
}

/**
 * Rest, and Finish or Discard. Rendered twice — in the header on desktop and
 * in the bottom bar on a phone — so both share one definition.
 */
function SessionActions({
  sessionId,
  canFinish,
  restSeconds,
  rest,
  finish,
  discard,
  fill = false,
}: {
  sessionId: string;
  canFinish: boolean;
  restSeconds: number;
  rest: RestTimerState;
  finish: (formData: FormData) => void;
  discard: (formData: FormData) => void;
  /** Phone layout: the rest timer takes the spare width and both are 48px tall. */
  fill?: boolean;
}) {
  const size = fill ? "h-12 px-5 text-sm" : "px-[18px] py-3 text-[13.5px]";
  return (
    <>
      <RestTimer rest={rest} seconds={restSeconds} className={fill ? "min-w-0 flex-1" : undefined} />
      {canFinish ? (
        <form action={finish}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <ActionButton
            pendingLabel="Finishing…"
            className={cn(
              "rounded-[11px] bg-accent font-bold text-[#0a0c0d] hover:bg-accent-hi",
              size,
            )}
          >
            Finish
          </ActionButton>
        </form>
      ) : (
        <form action={discard}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <ActionButton
            pendingLabel="Discarding…"
            className={cn(
              "rounded-[11px] border border-stroke bg-ghost font-semibold text-fg-2 hover:bg-hover",
              size,
            )}
          >
            Discard
          </ActionButton>
        </form>
      )}
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
  return <div className="hidden h-[38px] w-px bg-line lg:block" />;
}

/** "3 × 8-12", "3 × 45s", "20 MIN" — what the plan asks of this card. */
function targetLabel(ex: SessionExercise): string {
  const plan = ex.plan;
  if (!plan) return "EXTRA";
  const tracking = trackingOf(ex);
  if (tracking === "cardio") {
    return plan.target_seconds ? `${Math.round(plan.target_seconds / 60)} MIN` : `${plan.target_sets} × CARDIO`;
  }
  if (tracking === "time") {
    return plan.target_seconds ? `${plan.target_sets} × ${plan.target_seconds}S` : `${plan.target_sets} SETS`;
  }
  if (plan.rep_min == null) return `${plan.target_sets} SETS`;
  const range =
    plan.rep_max && plan.rep_max !== plan.rep_min ? `${plan.rep_min}-${plan.rep_max}` : `${plan.rep_min}`;
  return `${plan.target_sets} × ${range}${plan.per_side ? " /SIDE" : ""}`;
}

function ExerciseCard({
  ex,
  unit,
  system,
  mode,
  superset,
  showE1rm,
  focused,
  panel,
  work,
  canStartWork,
  draftOf,
  onFocus,
  onChange,
  onCommit,
  onToggle,
  onStartWork,
  onStopWork,
  onRemove,
  onAddSet,
  addBusy,
  onOpenDrawer,
}: {
  ex: SessionExercise;
  unit: string;
  system: UnitSystem;
  mode: RowMode;
  /** The superset letter this card belongs to, if any. */
  superset?: string;
  showE1rm: boolean;
  focused: boolean;
  panel?: SidePanelData;
  work: (Work & { elapsed: number }) | null;
  canStartWork: boolean;
  draftOf: (set: SessionExercise["sets"][number]) => SetDraft;
  onFocus: () => void;
  onChange: (id: string, draft: SetDraft) => void;
  onCommit: (id: string, draft: SetDraft) => Promise<void>;
  onToggle: (id: string, index: number, draft: SetDraft) => Promise<void>;
  onStartWork: (id: string, target: number | null) => void;
  onStopWork: (id: string, index: number, draft: SetDraft) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onAddSet: () => void;
  addBusy: boolean;
  onOpenDrawer: () => void;
}) {
  const tracking = mode.tracking;
  const withEffort = tracking === "reps" && mode.effort !== "off";
  const prescription = panel?.prescription;
  const best = panel?.best ?? null;

  const drafts = ex.sets.map((set) => ({ set, draft: draftOf(set) }));
  const ticked = drafts.filter((d) => d.draft.isComplete);

  // A PR is beating your previous best for this movement — not merely being
  // the best set of today, which would badge something on every exercise.
  const prSetId = (() => {
    if (tracking === "reps") {
      const today = bestSet(
        ticked.map(({ set, draft }) => ({
          id: set.id,
          weight_kg: draft.weight === "" ? null : Number(draft.weight),
          reps: draft.reps === "" ? null : Number(draft.reps),
        })),
      );
      if (!today || !best?.bestSet) return null;
      const todayE1rm = setOneRepMax(today);
      const previousE1rm = setOneRepMax({
        weight_kg: best.bestSet.weight_kg == null ? null : kgToDisplay(Number(best.bestSet.weight_kg), system),
        reps: best.bestSet.reps,
      });
      // Past the 12-rep cap there is no estimate, so a heavier load is the record.
      if (todayE1rm > 0) return previousE1rm > 0 && todayE1rm > previousE1rm ? today.id : null;
      const heaviest = kgToDisplay(best.heaviestKg, system);
      return heaviest > 0 && Number(today.weight_kg) > heaviest ? today.id : null;
    }
    if (tracking === "time") {
      let top: { id: string; s: number } | null = null;
      for (const { set, draft } of ticked) {
        const s = Number(draft.duration) || 0;
        if (!top || s > top.s) top = { id: set.id, s };
      }
      return top && best && best.longestS > 0 && top.s > best.longestS ? top.id : null;
    }
    return null;
  })();

  const todayE1rm = (() => {
    if (!showE1rm || tracking !== "reps") return null;
    const today = bestSet(
      ticked.map(({ draft }) => ({
        weight_kg: draft.weight === "" ? null : Number(draft.weight),
        reps: draft.reps === "" ? null : Number(draft.reps),
      })),
    );
    const value = today ? setOneRepMax(today) : 0;
    return value > 0 ? value : null;
  })();

  const repsPlaceholder =
    prescription?.reps != null
      ? String(prescription.reps)
      : ex.plan?.rep_max != null
        ? String(ex.plan.rep_max)
        : ex.plan?.rep_min != null
          ? String(ex.plan.rep_min)
          : undefined;
  const targetSeconds = prescription?.seconds ?? ex.plan?.target_seconds ?? null;
  const durationPlaceholder =
    targetSeconds == null
      ? undefined
      : tracking === "cardio"
        ? trimNumber(targetSeconds / 60, 1)
        : String(targetSeconds);

  const lastSet = ex.sets.at(-1);
  const removeLast = useAction();

  const columns =
    tracking === "cardio"
      ? ["Set", "Min", distanceUnit(system)]
      : tracking === "time"
        ? ["Set", unit, "Secs"]
        : ["Set", unit, "Reps", ...(withEffort ? [EFFORT_LABEL[mode.effort as "rpe" | "rir"]] : [])];

  return (
    <section
      onFocusCapture={onFocus}
      onClick={onFocus}
      className={cn(
        "overflow-hidden rounded-[18px] border bg-surface transition-colors",
        focused ? "border-line-hi" : "border-line",
      )}
    >
      <header
        className={cn(
          "flex items-center gap-3 px-4 py-3.5 sm:gap-3.5 sm:px-5 sm:py-4",
          focused ? "bg-done" : "bg-transparent",
        )}
      >
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label={`How to do ${ex.exercise.name}`}
          className="flex-none"
        >
          <ExerciseThumb
            src={ex.exercise.image_start_url}
            muscle={ex.exercise.primary_muscle}
            size={44}
            className="rounded-[11px]"
          />
        </button>
        <div className="min-w-0">
          {/* On a phone the name gets its own line rather than an ellipsis —
              "Barbell Romanian Deadlift" is the whole point of the card. */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {superset ? (
              <span className="flex-none rounded-[4px] bg-accent px-1.5 py-0.5 font-mono text-[9.5px] font-extrabold text-[#0a0c0d]">
                {superset}
              </span>
            ) : null}
            <h2 className="text-[15px] leading-tight font-bold tracking-[-0.01em] sm:truncate">
              {ex.exercise.name}
            </h2>
            <span className="flex-none font-mono text-[10px] font-medium text-fg-dim">
              {targetLabel(ex)}
            </span>
            {todayE1rm != null ? (
              <span className="flex-none font-mono text-[10px] font-semibold text-accent">
                E1RM {trimNumber(todayE1rm, 0)} {unit}
              </span>
            ) : null}
          </div>
          {ex.plan?.note ? (
            <p className="mt-0.5 text-[11.5px] text-fg-soft">{ex.plan.note}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onOpenDrawer}
          className="-mr-2 ml-auto flex-none self-center rounded-[10px] px-2 py-3.5 font-mono text-[11px] font-semibold text-accent hover:text-accent-hi"
        >
          HOW TO →
        </button>
      </header>

      {/* The rule's verdict on this movement, right where the sets are — on a
          phone the side panel is a long scroll away. */}
      {prescription && prescription.kind !== "off" ? (
        <p className="flex gap-2 border-t border-[#1a1e20] px-4 py-2.5 text-[12px] leading-[1.5] text-fg-muted sm:px-5">
          <span
            className={cn(
              "mt-px flex-none font-mono text-[9.5px] font-bold tracking-[0.1em] uppercase",
              prescription.kind === "up"
                ? "text-accent"
                : prescription.kind === "deload"
                  ? "text-warn"
                  : "text-fg-dim",
            )}
          >
            {prescription.kind === "up"
              ? "↑ Up"
              : prescription.kind === "deload"
                ? "↓ Deload"
                : prescription.kind === "first"
                  ? "New"
                  : "Hold"}
          </span>
          <span className="min-w-0">
            {prescription.why}
            <span className="ml-1.5 font-mono text-[10px] text-fg-dim uppercase">
              {POLICY_SHORT[prescription.policy]}
            </span>
          </span>
        </p>
      ) : null}

      <div className="px-3.5 pt-1.5 pb-3.5 sm:px-5 sm:pb-4">
        <div className={cn(setGrid(withEffort), "py-2.5 font-mono text-[10px] font-medium tracking-[0.1em] text-fg-dim uppercase")}>
          {columns.map((label, i) => (
            <div key={label} className={i === 0 ? undefined : "text-center sm:text-left"}>
              {label}
            </div>
          ))}
          <div />
          <div className="hidden sm:block" />
        </div>

        {drafts.map(({ set, draft }, i) => (
          <SetRow
            key={set.id}
            index={i}
            draft={draft}
            mode={mode}
            isPr={prSetId === set.id}
            placeholders={{ reps: repsPlaceholder, duration: durationPlaceholder }}
            work={
              tracking === "time"
                ? { running: work?.setId === set.id, elapsed: work?.setId === set.id ? work.elapsed : 0 }
                : undefined
            }
            onChange={(next) => onChange(set.id, next)}
            onCommit={() => onCommit(set.id, draftOf(set))}
            onToggle={() => onToggle(set.id, i, draft)}
            onRemove={() => onRemove(set.id)}
            onStartWork={
              tracking === "time" && canStartWork ? () => onStartWork(set.id, targetSeconds) : undefined
            }
            onStopWork={() => onStopWork(set.id, i, draftOf(set))}
          />
        ))}

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onAddSet}
            disabled={addBusy}
            aria-busy={addBusy || undefined}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-stroke py-3 text-xs font-semibold text-fg-dim transition-colors hover:border-accent hover:text-accent disabled:opacity-50 sm:py-2"
          >
            {addBusy ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <Plus className="size-3.5" strokeWidth={2} />
            )}
            Add a set
          </button>
          {/* Phones have no hover to reveal each row's remove button, and a
              hidden one beside the tick is one mis-tap from deleting a logged
              set. So a phone removes only the last set, and only while it is
              still unticked. */}
          {lastSet && !draftOf(lastSet).isComplete ? (
            <button
              type="button"
              onClick={() => removeLast.run(() => onRemove(lastSet.id))}
              disabled={removeLast.pending}
              aria-busy={removeLast.pending || undefined}
              className="flex min-h-11 items-center gap-1.5 rounded-[10px] border border-stroke px-4 py-3 text-xs font-semibold text-fg-dim transition-colors hover:border-danger-border hover:text-danger disabled:opacity-50 sm:hidden"
            >
              {removeLast.pending ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
              ) : null}
              Remove last
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
