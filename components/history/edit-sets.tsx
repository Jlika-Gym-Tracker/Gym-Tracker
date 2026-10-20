"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { removeSet, saveSet } from "@/app/actions/session";
import type { EffortScale, SetLog, Tracking, UnitSystem } from "@/lib/database.types";
import { EFFORT_LABEL } from "@/lib/training/effort";
import { distanceUnit, weightUnit } from "@/lib/units";
import { cn } from "@/lib/utils";
import { useAction } from "@/lib/use-action";
import { Card, Eyebrow } from "@/components/kit/card";
import {
  draftToPayload,
  missingForTick,
  toDraft,
  type RowMode,
  type SetDraft,
} from "@/components/session/set-row";

export type EditableExercise = {
  id: string;
  name: string;
  tracking: Tracking;
  /** Every set of the session, ticked or not. */
  sets: SetLog[];
};

/**
 * "What you did" on a finished session's summary, with an Edit sets mode for
 * putting a mistyped set right.
 *
 * Writes go through the same saveSet / removeSet as the live session, field by
 * field on blur, in the same display units and effort scale. After each one the
 * page is refreshed from the server, so the totals and records above it are
 * recomputed from the corrected log rather than patched here.
 */
export function EditableSets({
  exercises,
  system,
  effort,
  children,
}: {
  exercises: EditableExercise[];
  system: UnitSystem;
  effort: EffortScale;
  /** The read-only rows, rendered on the server. */
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <Card className={cn("flex flex-col gap-1", editing && "px-3.5 sm:px-5")}>
      <div className="mb-2 flex items-center gap-3">
        <Eyebrow>What you did</Eyebrow>
        {exercises.length ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-pressed={editing}
            className={cn(
              "-my-2 ml-auto flex min-h-10 items-center gap-1.5 rounded-[10px] border px-3 text-[12px] font-semibold transition-colors",
              editing
                ? "border-accent bg-accent text-[#0a0c0d] hover:bg-accent-hi"
                : "border-stroke bg-ghost text-fg-2 hover:bg-hover",
            )}
          >
            {editing ? <Check className="size-3.5" strokeWidth={2.5} /> : <Pencil className="size-3.5" strokeWidth={2} />}
            {editing ? "Done" : "Edit sets"}
          </button>
        ) : null}
      </div>
      {editing ? <SetEditor exercises={exercises} system={system} effort={effort} /> : children}
    </Card>
  );
}

function SetEditor({
  exercises,
  system,
  effort,
}: {
  exercises: EditableExercise[];
  system: UnitSystem;
  effort: EffortScale;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const modeFor = (ex: EditableExercise): RowMode => ({ tracking: ex.tracking, effort, system });

  // Held here, not re-read from props: the page refreshes after every write,
  // and a refresh must not clobber a field still being typed in.
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>(() =>
    Object.fromEntries(exercises.flatMap((ex) => ex.sets.map((s) => [s.id, toDraft(s, modeFor(ex))]))),
  );
  const saved = useRef<Record<string, string>>(
    Object.fromEntries(Object.entries(drafts).map(([id, d]) => [id, JSON.stringify(d)])),
  );
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function write(run: () => Promise<{ error?: string }>) {
    setError(null);
    setPending((n) => n + 1);
    try {
      const result = await run();
      if (result.error) {
        setError(result.error);
        return false;
      }
      startRefresh(() => router.refresh());
      return true;
    } catch {
      setError("That didn't save — check your connection and try again.");
      return false;
    } finally {
      setPending((n) => n - 1);
    }
  }

  async function commit(ex: EditableExercise, id: string, draft: SetDraft) {
    // Leaving a field you did not change is not an edit.
    const snapshot = JSON.stringify(draft);
    if (saved.current[id] === snapshot) return;
    const ok = await write(() => saveSet({ id, ...draftToPayload(draft, modeFor(ex)) }));
    if (ok) saved.current[id] = snapshot;
  }

  async function toggle(ex: EditableExercise, id: string) {
    const next = { ...drafts[id]!, isComplete: !drafts[id]!.isComplete };
    if (next.isComplete) {
      const missing = missingForTick(next, ex.tracking);
      if (missing) {
        setError(missing);
        return;
      }
    }
    setDrafts((prev) => ({ ...prev, [id]: next }));
    await commit(ex, id, next);
  }

  async function remove(id: string) {
    const ok = await write(() => removeSet(id));
    if (ok) setRemoved((prev) => new Set(prev).add(id));
  }

  const busy = pending > 0 || refreshing;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px] leading-[1.5] text-fg-soft">
        Progression reads this log, so a fix here also corrects your next targets.
      </p>

      {exercises.map((ex) => {
        const sets = ex.sets.filter((s) => !removed.has(s.id));
        const mode = modeFor(ex);
        const withEffort = ex.tracking === "reps" && effort !== "off";
        const columns =
          ex.tracking === "cardio"
            ? ["Set", "Min", distanceUnit(system)]
            : ex.tracking === "time"
              ? ["Set", weightUnit(system), "Secs"]
              : ["Set", weightUnit(system), "Reps", ...(withEffort ? [EFFORT_LABEL[effort as "rpe" | "rir"]] : [])];
        return (
          <section key={ex.id}>
            <h3 className="text-[13.5px] font-bold">{ex.name}</h3>
            {sets.length === 0 ? (
              <p className="py-2 text-[12px] text-fg-dim">Every set of this one is removed.</p>
            ) : (
              <>
                <div
                  aria-hidden
                  className={cn(editGrid(withEffort), "py-2 font-mono text-[10px] font-medium tracking-[0.1em] text-fg-dim uppercase")}
                >
                  {columns.map((label, i) => (
                    <div key={label} className={i === 0 ? undefined : "text-center sm:text-left"}>
                      {label}
                    </div>
                  ))}
                  <div />
                  <div />
                </div>
                {sets.map((set, i) => (
                  <EditSetRow
                    key={set.id}
                    index={i}
                    draft={drafts[set.id]!}
                    mode={mode}
                    withEffort={withEffort}
                    onChange={(next) => setDrafts((prev) => ({ ...prev, [set.id]: next }))}
                    onCommit={(draft) => commit(ex, set.id, draft)}
                    onToggle={() => toggle(ex, set.id)}
                    onRemove={() => remove(set.id)}
                  />
                ))}
              </>
            )}
          </section>
        );
      })}

      <p aria-live="polite" className="min-h-[18px] text-[12px]">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : busy ? (
          <span className="inline-flex items-center gap-1.5 text-fg-dim">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Saving and updating the totals…
          </span>
        ) : (
          <span className="text-fg-dim">Changes save as you leave each field.</span>
        )}
      </p>
    </div>
  );
}

/**
 * set · load · reps · effort · tick · remove. Tighter than the live grid so
 * the remove column fits a 360px phone too: here it is the point of the
 * screen, not a mis-tap waiting beside the tick.
 */
function editGrid(withEffort: boolean) {
  return withEffort
    ? "grid grid-cols-[20px_1fr_1fr_48px_40px_32px] items-center gap-1.5 sm:grid-cols-[32px_1fr_1fr_84px_40px_36px] sm:gap-2.5"
    : "grid grid-cols-[20px_1fr_1fr_40px_32px] items-center gap-1.5 sm:grid-cols-[32px_1fr_1fr_40px_36px] sm:gap-2.5";
}

function EditSetRow({
  index,
  draft,
  mode,
  withEffort,
  onChange,
  onCommit,
  onToggle,
  onRemove,
}: {
  index: number;
  draft: SetDraft;
  mode: RowMode;
  withEffort: boolean;
  onChange: (next: SetDraft) => void;
  onCommit: (draft: SetDraft) => Promise<void>;
  onToggle: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const tick = useAction();
  const drop = useAction();
  // Removing a logged set cannot be undone, so it takes two taps: the first
  // arms the button, the second removes. It disarms itself after a moment.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  const label = `Set ${index + 1}`;
  const done = draft.isComplete;
  // 16px on a phone: iOS Safari zooms into any smaller input.
  const field = cn(
    "w-full min-w-0 rounded-[9px] border px-1 py-2.5 text-center font-mono text-base font-semibold outline-none transition-colors",
    "sm:px-3 sm:py-2 sm:text-left sm:text-[13px]",
    done ? "border-line-hi bg-done text-accent" : "border-line bg-surface-2 text-fg-2 focus:border-line-hi",
  );

  const input = (key: keyof Omit<SetDraft, "isComplete">, aria: string, numeric = false) => (
    <input
      inputMode={numeric ? "numeric" : "decimal"}
      aria-label={`${label} ${aria}`}
      value={draft[key]}
      onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
      onBlur={(e) => void onCommit({ ...draft, [key]: e.target.value })}
      placeholder="—"
      className={field}
    />
  );

  return (
    <div className={cn(editGrid(withEffort), "py-1")}>
      <span className="font-mono text-xs font-bold text-fg-soft">{index + 1}</span>

      {mode.tracking === "cardio" ? (
        <>
          {input("duration", "minutes")}
          {input("distance", "distance")}
        </>
      ) : (
        <>
          {input("weight", "weight")}
          {mode.tracking === "time" ? input("duration", "seconds held", true) : input("reps", "reps", true)}
        </>
      )}
      {withEffort ? input("effort", mode.effort.toUpperCase()) : null}

      <button
        type="button"
        onClick={() => tick.run(onToggle)}
        disabled={tick.pending}
        aria-busy={tick.pending || undefined}
        aria-pressed={done}
        aria-label={`Mark ${label.toLowerCase()} ${done ? "not done" : "done"}`}
        className={cn(
          "flex size-10 items-center justify-center rounded-[10px] border transition-colors hover:border-accent sm:size-[34px] sm:rounded-[9px]",
          done ? "border-accent bg-accent" : "border-stroke bg-surface-2",
        )}
      >
        {tick.pending ? (
          <Loader2 className={cn("size-4 animate-spin", done ? "text-[#0a0c0d]" : "text-fg-muted")} strokeWidth={2.5} />
        ) : done ? (
          <Check className="size-4 text-[#0a0c0d]" strokeWidth={3} />
        ) : (
          <span className="size-[9px] rounded-[2px] bg-[#2f3639]" />
        )}
      </button>

      <button
        type="button"
        onClick={() => (armed ? drop.run(onRemove) : setArmed(true))}
        onBlur={() => setArmed(false)}
        disabled={drop.pending}
        aria-busy={drop.pending || undefined}
        aria-label={armed ? `Tap again to remove ${label.toLowerCase()}` : `Remove ${label.toLowerCase()}`}
        className={cn(
          "flex h-10 w-full items-center justify-center rounded-[9px] border transition-colors sm:h-[34px]",
          armed
            ? "border-danger-border bg-danger-soft text-danger"
            : "border-transparent text-fg-faint hover:text-danger",
        )}
      >
        {drop.pending ? (
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
        ) : armed ? (
          <Trash2 className="size-3.5" strokeWidth={2} />
        ) : (
          <X className="size-3.5" strokeWidth={2} />
        )}
      </button>
    </div>
  );
}
