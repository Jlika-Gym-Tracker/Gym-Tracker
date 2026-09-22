"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A submit button that shows its own progress.
 *
 * Server actions can take a second or two against a remote database, and a
 * button that neither moves nor disables invites a second click — which for
 * "Finish session" or "Create a code" means doing the thing twice.
 *
 * Only the button that was actually pressed spins. Its siblings disable
 * instead, so a form with Accept and Decline does not appear to do both.
 */
export function ActionButton({
  children,
  pendingLabel,
  spinnerOnly = false,
  className,
  onClick,
  ...props
}: React.ComponentProps<"button"> & {
  pendingLabel?: string;
  /** Icon-only buttons: the spinner takes the icon's place rather than sitting beside it. */
  spinnerOnly?: boolean;
}) {
  const { pending } = useFormStatus();
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (!pending) setPressed(false);
  }, [pending]);

  const busy = pending && pressed;

  return (
    <button
      type="submit"
      {...props}
      onClick={(event) => {
        setPressed(true);
        onClick?.(event);
      }}
      disabled={pending || props.disabled}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 disabled:opacity-60",
        busy && "cursor-progress",
        className,
      )}
    >
      {busy ? <Loader2 className="size-3.5 flex-none animate-spin" aria-hidden /> : null}
      {busy && spinnerOnly ? null : busy && pendingLabel ? pendingLabel : children}
    </button>
  );
}
