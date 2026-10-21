"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { removeExercise, updateExercise, type ActionState } from "@/app/actions/exercises";
import { useAction } from "@/lib/use-action";
import { Card } from "@/components/kit/card";
import { ActionButton } from "@/components/kit/action-button";
import { cn } from "@/lib/utils";
import { ExerciseFields, FormError, type ExerciseDraft } from "./exercise-form";

/**
 * Edit or remove a movement you added. Removing one with history archives it
 * (out of the library and pickers, still named in history); one with nothing
 * logged is deleted. Either way, plans that already use it keep it — the
 * confirmation says so before anything happens.
 */
export function OwnerTools({
  exerciseId,
  draft,
  loggedSets,
  plannedDays,
}: {
  exerciseId: string;
  draft: ExerciseDraft;
  /** Completed sets in your history; any at all locks "logged as". */
  loggedSets: number;
  /** Planned days, in any of your weeks, that use it. */
  plannedDays: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "edit" | "remove">("idle");
  const [state, save] = useActionState(updateExercise, {} as ActionState);
  const remove = useAction({ announce: "soft", label: "Removing" });
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Mirrors removeExercise: history archives it, and so does a plan that
  // still points at it (it cannot be deleted from under that plan).
  const keeps = loggedSets > 0;
  const archives = keeps || plannedDays > 0;
  const tab = (active: boolean) =>
    cn(
      "hit rounded-lg border px-3 py-1.5 font-mono text-[10.5px] font-semibold transition-colors",
      active ? "border-line-sel bg-accent-soft text-accent" : "border-stroke text-fg-soft hover:border-accent hover:text-accent",
    );

  return (
    <Card className="rounded-[18px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <div className="eyebrow">Your exercise</div>
          <p className="mt-1.5 text-[12.5px] text-fg-muted">Only you see it. Edit it, or take it out of your library.</p>
        </div>
        <button type="button" onClick={() => setMode(mode === "edit" ? "idle" : "edit")} aria-expanded={mode === "edit"} className={tab(mode === "edit")}>
          EDIT
        </button>
        <button type="button" onClick={() => setMode(mode === "remove" ? "idle" : "remove")} aria-expanded={mode === "remove"} className={tab(mode === "remove")}>
          REMOVE
        </button>
      </div>

      {mode === "edit" ? (
        <form action={save} className="mt-3.5 flex flex-col gap-2.5 rounded-[12px] border border-line bg-surface-2 p-3">
          <input type="hidden" name="id" value={exerciseId} />
          <ExerciseFields
            defaults={draft}
            trackingLocked={
              keeps
                ? "It has logged sets, and they were logged this way — so this stays as it is."
                : null
            }
          />
          <FormError message={state.error} />
          {state.notice && !state.error ? (
            <p role="status" className="text-[12px] text-accent">
              {state.notice}
            </p>
          ) : null}
          <ActionButton
            pendingLabel="Saving…"
            className="w-fit rounded-[10px] bg-accent px-4 py-2.5 text-[12.5px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
          >
            Save changes
          </ActionButton>
        </form>
      ) : null}

      {mode === "remove" ? (
        <div className="mt-3.5 rounded-[12px] border border-danger-border bg-danger-soft p-3.5">
          <p className="text-[13px] leading-[1.55] text-fg-2">
            {keeps
              ? `It has ${loggedSets} logged ${loggedSets === 1 ? "set" : "sets"}, so it is archived rather than deleted: it leaves your library and the exercise pickers, and your history, summaries and charts keep its name.`
              : archives
                ? "It is archived rather than deleted, because a plan uses it: it leaves your library and the exercise pickers."
                : "Nothing has been logged with it and no plan uses it, so it is deleted for good."}{" "}
            {plannedDays > 0
              ? `It stays in the ${plannedDays} planned ${plannedDays === 1 ? "day" : "days"} that already use it; take it out of those in the program builder if you want it gone there too.`
              : null}
          </p>
          {removeError ? <p className="mt-2 text-[12px] text-danger">{removeError}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={remove.pending}
              aria-busy={remove.pending || undefined}
              onClick={() =>
                remove.run(async () => {
                  setRemoveError(null);
                  const result = await removeExercise(exerciseId);
                  if (result.error) setRemoveError(result.error);
                  else router.push("/exercises");
                })
              }
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-danger-border bg-[#3a1414] px-4 py-2.5 text-[12.5px] font-bold text-danger hover:bg-[#4a1919] disabled:opacity-60"
            >
              {remove.pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              {archives ? "Archive it" : "Delete it"}
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="rounded-[10px] border border-stroke px-4 py-2.5 text-[12.5px] font-semibold text-fg-soft hover:text-fg"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
