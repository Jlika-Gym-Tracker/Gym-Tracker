"use client";

import { Loader2 } from "lucide-react";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

/**
 * A button outside a form that runs a server action.
 *
 * Owns its own progress, so each instance in a list spins only for its own
 * write, disables while that write is in flight, and drops repeat presses.
 * Inside a <form>, use ActionButton instead — that one reads the form's status.
 */
export function AsyncButton({
  action,
  children,
  spinner = "prepend",
  className,
  disabled,
  ...props
}: Omit<React.ComponentProps<"button">, "onClick"> & {
  action: () => unknown | Promise<unknown>;
  /** "replace" hands the spinner the children's place — for icon-only buttons. */
  spinner?: "prepend" | "replace";
}) {
  const { pending, run } = useAction();

  return (
    <button
      type="button"
      {...props}
      onClick={() => run(action)}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={cn(pending && "cursor-progress", className)}
    >
      {pending ? (
        <Loader2 className="size-3.5 flex-none animate-spin" aria-hidden />
      ) : null}
      {pending && spinner === "replace" ? null : children}
    </button>
  );
}
