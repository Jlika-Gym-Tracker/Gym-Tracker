"use client";

import { useEffect, useState } from "react";
import { BarbellLoader } from "@/components/kit/barbell-loader";

const STAGES: Record<"plan" | "refine" | "review", { after: number; text: string }[]> = {
  plan: [
    { after: 0, text: "Sending your answers and library…" },
    { after: 4, text: "Designing your week…" },
    { after: 30, text: "Still writing — a whole week takes a while…" },
    { after: 60, text: "Checking every exercise against your library…" },
  ],
  refine: [
    { after: 0, text: "Sending your request…" },
    { after: 4, text: "Revising the week…" },
    { after: 40, text: "Checking the revised week…" },
  ],
  review: [
    { after: 0, text: "Summarising four weeks of sessions…" },
    { after: 4, text: "Reading the evidence…" },
    { after: 30, text: "Weighing what to change…" },
    { after: 55, text: "Checking each change against your plan…" },
  ],
};

/**
 * Shown in place of the form while a run is in flight. A Server Action cannot
 * stream progress back, so the stages are paced by the clock rather than
 * reported — the elapsed time is the honest part.
 */
export function RunProgress({ kind }: { kind: "plan" | "refine" | "review" }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const stage = [...STAGES[kind]].reverse().find((s) => seconds >= s.after)!;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center rounded-[18px] border border-line-hi bg-surface px-5 py-8 text-center"
    >
      <BarbellLoader width={112} />
      <p className="mt-4 text-[13.5px] font-semibold text-fg-2">{stage.text}</p>
      <p className="mt-1.5 font-mono text-[11px] text-fg-dim tabular-nums">
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} · usually 20–90 s
      </p>
      <p className="mt-3 max-w-[340px] text-[11.5px] leading-[1.5] text-fg-dim">
        Keep this page open. Nothing in your program changes until you approve it.
      </p>
    </div>
  );
}
