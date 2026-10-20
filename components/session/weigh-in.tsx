"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { setSessionBodyweight } from "@/app/actions/session";
import type { UnitSystem } from "@/lib/database.types";
import { toDateString } from "@/lib/dates";
import { displayToKg, kgToDisplay, trimNumber, weightUnit } from "@/lib/units";
import { useAction } from "@/lib/use-action";

/**
 * "Weigh in?" at the top of a fresh session — the moment most people are next
 * to a scale. Pre-filled with the last weigh-in so the usual case is one tap.
 * Skippable, and gone once answered.
 */
export function WeighIn({
  sessionId,
  system,
  current,
  lastKg,
}: {
  sessionId: string;
  system: UnitSystem;
  /** Already recorded on this session. */
  current: number | null;
  /** The most recent weigh-in, for the starting value. */
  lastKg: number | null;
}) {
  const unit = weightUnit(system);
  const [value, setValue] = useState(
    lastKg == null ? "" : trimNumber(kgToDisplay(lastKg, system), 1),
  );
  const [saved, setSaved] = useState<number | null>(current);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useAction();

  if (saved != null) {
    return (
      <p className="px-1 font-mono text-[10.5px] text-fg-dim uppercase">
        Bodyweight today · {trimNumber(kgToDisplay(saved, system), 1)} {unit}
      </p>
    );
  }
  if (skipped) return null;

  function submit() {
    const n = Number(value.replace(",", "."));
    if (!value.trim() || Number.isNaN(n)) {
      setError(`Type your weight in ${unit}, or skip.`);
      return;
    }
    const kg = displayToKg(n, system);
    save.run(async () => {
      const result = await setSessionBodyweight(sessionId, kg, toDateString(new Date()));
      if (result.error) setError(result.error);
      else setSaved(kg);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-[18px] border border-line bg-surface px-4 py-3">
      <span className="text-[13px] font-semibold text-fg-2">Weigh in first?</span>
      <label className="flex items-center gap-1.5">
        <input
          inputMode="decimal"
          aria-label={`Bodyweight in ${unit}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="—"
          className="w-20 rounded-[9px] border border-line bg-surface-2 px-2.5 py-2 text-center font-mono text-base font-semibold text-fg-2 outline-none focus:border-line-hi sm:text-[13px]"
        />
        <span className="font-mono text-[11px] text-fg-dim">{unit}</span>
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={save.pending}
        aria-busy={save.pending || undefined}
        className="flex min-h-10 items-center gap-1.5 rounded-[10px] bg-accent px-3.5 text-[12.5px] font-bold text-[#0a0c0d] hover:bg-accent-hi disabled:opacity-60"
      >
        {save.pending ? <Loader2 className="size-3.5 animate-spin" strokeWidth={2} /> : null}
        Save
      </button>
      <button
        type="button"
        onClick={() => setSkipped(true)}
        className="min-h-10 rounded-[10px] px-2.5 text-[12.5px] font-semibold text-fg-dim hover:text-fg"
      >
        Skip
      </button>
      {error ? <p className="w-full text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
