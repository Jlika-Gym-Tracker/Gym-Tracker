"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteSession, type ActionState } from "@/app/actions/session";
import { ActionButton } from "@/components/kit/action-button";

/**
 * Deletes a finished workout, behind one confirmation. On success the action
 * redirects to the month it was in, so there is no "deleted" state to show.
 */
export function DeleteWorkout({ sessionId }: { sessionId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action] = useActionState(deleteSession, {} as ActionState);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-[11px] border border-stroke bg-ghost px-4 text-[13px] font-semibold text-fg-soft transition-colors hover:border-danger-border hover:text-danger"
      >
        <Trash2 className="size-3.5" strokeWidth={2} />
        Delete workout
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-labelledby="delete-workout-title" className="rounded-[16px] border border-danger-border bg-danger-soft p-4">
      <p id="delete-workout-title" className="text-[14px] font-bold text-fg">
        Delete this workout?
      </p>
      <p className="mt-1 text-[12.5px] leading-[1.5] text-fg-muted">
        This removes it from your history for good.
      </p>
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <form action={action}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <ActionButton
            pendingLabel="Deleting…"
            className="min-h-11 rounded-[11px] bg-danger px-4 text-[13px] font-bold text-[#0a0c0d]"
          >
            Delete it
          </ActionButton>
        </form>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          autoFocus
          className="min-h-11 rounded-[11px] border border-stroke bg-ghost px-4 text-[13px] font-semibold text-fg-2 hover:bg-hover"
        >
          Keep it
        </button>
      </div>
      {state.error ? <p className="mt-2.5 text-[12px] text-danger">{state.error}</p> : null}
    </div>
  );
}
