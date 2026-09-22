"use client";

import { useCallback, useRef, useTransition } from "react";

/**
 * Runs a server action from a control that is not inside a <form>.
 *
 * Those get no useFormStatus, so before this they neither disabled nor showed
 * progress: four quick taps on "Add a set" sent two writes and added two sets.
 * Clicks that arrive while one is in flight are dropped — a ref, not the
 * transition's `pending`, because a second tap can land in the same render.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  const run = useCallback(
    (action: () => unknown | Promise<unknown>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      startTransition(async () => {
        try {
          await action();
        } finally {
          inFlight.current = false;
        }
      });
    },
    [],
  );

  return { pending, run };
}
