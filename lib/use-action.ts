"use client";

import { useCallback, useRef, useTransition } from "react";
import { useReportActivity, type ActivityMode } from "@/lib/activity";

/**
 * Runs a server action from a control that is not inside a <form>.
 *
 * Those get no useFormStatus, so before this they neither disabled nor showed
 * progress: four quick taps on "Add a set" sent two writes and added two sets.
 * Clicks that arrive while one is in flight are dropped — a ref, not the
 * transition's `pending`, because a second tap can land in the same render.
 *
 * `announce` also reports to the app-wide loader (lib/activity.ts), in the
 * given mode. Explicit commands want it ("Create a code"); the quick writes
 * this also runs — ticking a set, a grocery item — do not: they update on
 * screen at once, and a loader per tap mid-workout would be noise.
 */
export function useAction({
  announce = false,
  label,
}: { announce?: ActivityMode | false; label?: string } = {}) {
  const [pending, startTransition] = useTransition();
  useReportActivity(announce !== false && pending, {
    mode: announce === false ? undefined : announce,
    label,
  });
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
