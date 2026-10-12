"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { applyPastedWeek } from "@/app/actions/program";
import { parseProgramText } from "@/lib/program/parse";
import {
  findCandidates,
  matchExercises,
  type LibraryExercise,
} from "@/lib/program/match";
import { useReportActivity } from "@/lib/activity";
import { cn } from "@/lib/utils";

const SAMPLE = `DAY 1 — UPPER A
1 Incline Dumbbell Press 3 x 8-12
2 Wide Grip Lat Pulldown 3 x 8-12
3 Machine Chest Press 3 x 10-12`;

type Resolution = {
  dayIndex: number;
  order: number;
  /** null = the user chose to skip this line. */
  exerciseId: string | null;
};

export function PastePanel({
  weekStart,
  weekLabel,
  library,
  onClose,
}: {
  weekStart: string;
  weekLabel: string;
  library: LibraryExercise[];
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useReportActivity(pending, { label: "Importing" });

  const parsed = useMemo(() => parseProgramText(text), [text]);

  /** Every parsed exercise paired with its best library match. */
  const matched = useMemo(() => {
    return parsed.days.map((day, dayIndex) => ({
      day,
      dayIndex,
      items: matchExercises(day.exercises, library).map((outcome, order) => ({
        ...outcome,
        key: `${dayIndex}:${order}`,
        order,
      })),
    }));
  }, [parsed, library]);

  const allItems = matched.flatMap((d) => d.items);
  const autoMatched = allItems.filter((i) => i.matched).length;
  const needsReview = allItems.length - autoMatched;

  function resolutionFor(key: string, fallbackId: string | null): string | null {
    return key in resolutions ? resolutions[key]!.exerciseId : fallbackId;
  }

  function apply() {
    setError(null);
    const days = matched.map(({ day, items }) => ({
      dayIndex: day.dayIndex,
      name: day.name,
      focusNote: day.focusNote,
      isRest: day.isRest,
      exercises: items
        .map((item) => ({
          exerciseId: resolutionFor(item.key, item.matched?.id ?? null),
          targetSets: item.parsed.targetSets,
          repMin: item.parsed.repMin,
          repMax: item.parsed.repMax,
          perSide: item.parsed.perSide,
          note: item.parsed.note,
        }))
        .filter((e): e is typeof e & { exerciseId: string } => Boolean(e.exerciseId)),
    }));

    if (days.every((d) => d.exercises.length === 0)) {
      setError("Nothing to import — every line was skipped or unmatched.");
      return;
    }

    startTransition(async () => {
      const result = await applyPastedWeek(weekStart, weekLabel, days);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div className="rounded-[18px] border border-line-hi bg-surface p-5">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-bold">
          {reviewing ? "Review the matches" : "Paste your week"}
        </h2>
        <span className="ml-auto font-mono text-[10.5px] text-fg-dim uppercase">
          {reviewing ? `${allItems.length} lines` : "Plain text · parsed into sets & reps"}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the paste panel"
          className="rounded p-1 text-fg-dim hover:text-fg"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>

      {!reviewing ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder={SAMPLE}
            aria-label="Paste your training week"
            className="w-full resize-y rounded-xl border border-line bg-[#0a0c0d] p-3.5 font-mono text-xs leading-[1.75] text-fg-muted outline-none placeholder:text-fg-faint focus:border-line-hi"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={parsed.days.length === 0}
              onClick={() => setReviewing(true)}
              className="rounded-[10px] bg-accent px-[18px] py-[11px] text-[13px] font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi disabled:cursor-not-allowed disabled:opacity-40"
            >
              Parse {parsed.parsedLineCount} lines
            </button>
            {text.trim() ? (
              <p className="text-xs text-fg-soft">
                {allItems.length} exercises across {parsed.days.length} days ·{" "}
                <span className="text-accent-2">{autoMatched} matched</span>
                {needsReview > 0 ? (
                  <>
                    {" · "}
                    <span className="text-warn">{needsReview} need review</span>
                  </>
                ) : null}
                {parsed.issues.length > 0 ? (
                  <>
                    {" · "}
                    <span className="text-fg-dim">
                      {parsed.issues.length} lines ignored
                    </span>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="text-xs text-fg-soft">
                One exercise per line, e.g. <code className="font-mono">3 x 8-12</code>.
                Day headers like <code className="font-mono">DAY 1 — UPPER A</code> split
                the week.
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex max-h-[440px] flex-col gap-4 overflow-y-auto pr-1">
            {matched.map(({ day, dayIndex, items }) => (
              <div key={dayIndex}>
                <div className="eyebrow mb-2">
                  {day.name} · {items.length} exercises
                </div>
                <div className="flex flex-col gap-1.5">
                  {items.map((item) => {
                    const chosen = resolutionFor(item.key, item.matched?.id ?? null);
                    const options = item.candidates.length
                      ? item.candidates
                      : findCandidates(item.parsed.name, library, 4);
                    const skipped = item.key in resolutions && chosen === null;

                    return (
                      <div
                        key={item.key}
                        className={cn(
                          "flex items-center gap-3 rounded-[10px] border px-3 py-2",
                          skipped
                            ? "border-line bg-surface-2 opacity-50"
                            : item.matched
                              ? "border-line bg-surface-2"
                              : "border-warn/40 bg-warn-soft/40",
                        )}
                      >
                        {item.matched && !skipped ? (
                          <Check className="size-3.5 flex-none text-accent" strokeWidth={2.5} />
                        ) : (
                          <AlertTriangle
                            className="size-3.5 flex-none text-warn"
                            strokeWidth={2}
                          />
                        )}
                        <span className="w-[168px] flex-none truncate text-[12.5px] font-semibold">
                          {item.parsed.name}
                        </span>
                        <span className="flex-none font-mono text-[10.5px] text-fg-dim">
                          {item.parsed.targetSets} ×{" "}
                          {item.parsed.repMin == null
                            ? "sets"
                            : item.parsed.repMax && item.parsed.repMax !== item.parsed.repMin
                              ? `${item.parsed.repMin}-${item.parsed.repMax}`
                              : item.parsed.repMin}
                          {item.parsed.perSide ? " /side" : ""}
                        </span>
                        <select
                          value={chosen ?? ""}
                          onChange={(e) =>
                            setResolutions((prev) => ({
                              ...prev,
                              [item.key]: {
                                dayIndex,
                                order: item.order,
                                exerciseId: e.target.value || null,
                              },
                            }))
                          }
                          aria-label={`Library match for ${item.parsed.name}`}
                          className="ml-auto min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-fg-2 outline-none focus:border-line-hi"
                        >
                          <option value="">Skip this line</option>
                          {options.map((c) => (
                            <option key={c.exercise.id} value={c.exercise.id}>
                              {c.exercise.name} ({Math.round(c.score * 100)}%)
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {error ? (
            <p className="mt-3 rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-2.5">
            <button
              type="button"
              disabled={pending}
              onClick={apply}
              className="rounded-[10px] bg-accent px-[18px] py-[11px] text-[13px] font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi disabled:opacity-60"
            >
              {pending ? "Importing…" : "Replace week with this"}
            </button>
            <button
              type="button"
              onClick={() => setReviewing(false)}
              className="rounded-[10px] border border-stroke bg-ghost px-4 py-[11px] text-[13px] font-semibold text-fg-2 hover:bg-hover"
            >
              Back to the text
            </button>
            <p className="text-xs text-fg-soft">
              This replaces every day in {weekLabel}.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
