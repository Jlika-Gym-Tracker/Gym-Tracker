"use client";

import { useActionState, useEffect, useState } from "react";
import { createExercise, type ActionState } from "@/app/actions/exercises";
import type { Equipment, Muscle, Tracking } from "@/lib/database.types";
import { MUSCLES } from "@/lib/training/muscle-load";
import { ActionButton } from "@/components/kit/action-button";
import { cn } from "@/lib/utils";
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from "./taxonomy";

export const FIELD =
  "w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 text-base text-fg-2 outline-none focus:border-line-hi disabled:opacity-60 sm:text-[13px]";

export type ExerciseDraft = {
  name: string;
  primaryMuscle: Muscle | "";
  equipment: Equipment;
  tracking: Tracking;
  description: string;
};

/**
 * The fields of your own movement, shared by "add your own" and editing one.
 * Field names are what app/actions/exercises.ts reads.
 */
export function ExerciseFields({
  defaults,
  name,
  onNameChange,
  trackingLocked,
}: {
  defaults?: Partial<ExerciseDraft>;
  /** Controlled name, when the caller needs it (to prefill from a search). */
  name?: string;
  onNameChange?: (name: string) => void;
  /** Why "logged as" cannot change, or null when it can. */
  trackingLocked?: string | null;
}) {
  return (
    <>
      <label className="block">
        <span className="eyebrow mb-1.5 block">Name</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={80}
          {...(onNameChange
            ? { value: name ?? "", onChange: (e) => onNameChange(e.target.value) }
            : { defaultValue: defaults?.name ?? "" })}
          placeholder="Sissy squat, Landmine press…"
          className={FIELD}
        />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="block min-w-0">
          <span className="eyebrow mb-1.5 block">Works</span>
          <select name="primaryMuscle" required defaultValue={defaults?.primaryMuscle ?? ""} className={FIELD}>
            <option value="" disabled>
              Pick one
            </option>
            {MUSCLES.map((key) => (
              <option key={key} value={key}>
                {MUSCLE_LABEL[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="eyebrow mb-1.5 block">Equipment</span>
          <select name="equipment" defaultValue={defaults?.equipment ?? "other"} className={FIELD}>
            {Object.entries(EQUIPMENT_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="eyebrow mb-1.5 block">Logged as</span>
        <select
          name="tracking"
          defaultValue={defaults?.tracking ?? "reps"}
          disabled={Boolean(trackingLocked)}
          className={FIELD}
        >
          <option value="reps">Weight × reps</option>
          <option value="time">Time held (planks, hangs, carries)</option>
          <option value="cardio">Cardio — time and distance</option>
        </select>
        {trackingLocked ? (
          <>
            {/* A disabled select is not submitted; the action still needs the value. */}
            <input type="hidden" name="tracking" value={defaults?.tracking ?? "reps"} />
            <span className="mt-1.5 block text-[11.5px] leading-[1.45] text-fg-dim">{trackingLocked}</span>
          </>
        ) : null}
      </label>
      <label className="block">
        <span className="eyebrow mb-1.5 block">How to do it — optional</span>
        <textarea
          name="description"
          maxLength={600}
          rows={3}
          defaultValue={defaults?.description ?? ""}
          placeholder="A line or two for future you."
          className={cn(FIELD, "resize-none")}
        />
      </label>
    </>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-[12px] text-danger">
      {message}
    </p>
  );
}

/** A name and a muscle are enough; the rest has sensible defaults. */
export function CreateExercise({
  initialName,
  onCreated,
}: {
  initialName: string;
  onCreated: (name: string) => void;
}) {
  const [state, create] = useActionState(createExercise, {} as ActionState);
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (state.id) onCreated(name);
    // Only when a new exercise lands, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.id]);

  return (
    <form action={create} className="mt-3.5 flex flex-col gap-2.5 rounded-[12px] border border-line bg-surface-2 p-3">
      <ExerciseFields name={name} onNameChange={setName} />
      <FormError message={state.error} />
      <ActionButton
        pendingLabel="Adding…"
        className="w-fit rounded-[10px] bg-accent px-4 py-2.5 text-[12.5px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
      >
        Add to my library
      </ActionButton>
    </form>
  );
}
