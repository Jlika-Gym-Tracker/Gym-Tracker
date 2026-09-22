"use client";

import { useTransition } from "react";
import { startSession } from "@/app/actions/session";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/kit/action-button";

export function StartSessionButton({
  dayId,
  name,
  meta,
  freeform = false,
  variant = "tile",
}: {
  dayId?: string;
  name: string;
  meta: string;
  freeform?: boolean;
  /** "primary" is the lime hero CTA; "tile" is the pickable day card. */
  variant?: "primary" | "tile";
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => startTransition(() => startSession(fd))}
      className={cn(freeform && "mt-2.5")}
    >
      {dayId ? <input type="hidden" name="dayId" value={dayId} /> : null}
      <ActionButton
        disabled={pending}
        className={cn(
          "w-full text-left transition-colors disabled:opacity-60",
          variant === "primary"
            ? "rounded-[11px] bg-accent px-[22px] py-3 text-[#0a0c0d] hover:bg-accent-hi"
            : cn(
                "rounded-[14px] border px-4 py-3.5",
                freeform
                  ? "border-dashed border-stroke hover:border-accent"
                  : "border-line bg-surface-2 hover:border-line-sel hover:bg-accent-soft",
              ),
        )}
      >
        <span className="block text-[14px] font-bold">{name}</span>
        <span
          className={cn(
            "mt-0.5 block font-mono text-[10.5px] uppercase",
            variant === "primary" ? "text-[#0a0c0d]/70" : "text-fg-dim",
          )}
        >
          {pending ? "Starting…" : meta}
        </span>
      </ActionButton>
    </form>
  );
}
