"use client";

import { useTransition } from "react";
import { startSession } from "@/app/actions/session";
import { cn } from "@/lib/utils";

export function StartSessionButton({
  dayId,
  name,
  meta,
  freeform = false,
}: {
  dayId?: string;
  name: string;
  meta: string;
  freeform?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => startTransition(() => startSession(fd))}
      className={cn(freeform && "mt-2.5")}
    >
      {dayId ? <input type="hidden" name="dayId" value={dayId} /> : null}
      <button
        type="submit"
        disabled={pending}
        className={cn(
          "w-full rounded-[14px] border px-4 py-3.5 text-left transition-colors disabled:opacity-60",
          freeform
            ? "border-dashed border-stroke hover:border-accent"
            : "border-line bg-surface-2 hover:border-line-sel hover:bg-accent-soft",
        )}
      >
        <span className="block text-[14px] font-bold">{name}</span>
        <span className="mt-0.5 block font-mono text-[10.5px] text-fg-dim uppercase">
          {pending ? "Starting…" : meta}
        </span>
      </button>
    </form>
  );
}
