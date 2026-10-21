"use client";

import { useMemo, useState, useTransition } from "react";
import { parseISO } from "date-fns";
import { AlertTriangle, Check, Plus, X } from "lucide-react";
import { applyPastedWeek } from "@/app/actions/program";
import { parseProgramText, type ParsedExercise } from "@/lib/program/parse";
import { findCandidates, type LibraryExercise } from "@/lib/program/match";
import { matchPasted } from "@/lib/program/paste-match";
import { MUSCLE_LABELS, MUSCLES, guessEquipment, guessMuscle } from "@/lib/import/guess";
import type { Muscle } from "@/lib/database.types";
import { useReportActivity } from "@/lib/activity";
import { cn } from "@/lib/utils";

const SAMPLE = `Monday - Upper A
Barbell Bench Press: 3 × 6–10
Single-Arm Dumbbell Row: 3 × 10 each
Plank: 3 × 30–60 sec
Cardio: 15 min incline treadmill walk`;

/** What the review step decided for one pasted line. */
type Choice =
  | { kind: "library"; id: string }
  | { kind: "new"; muscle: Muscle }
  | { kind: "skip" };

const NEW_VALUE = "__new__";

/** A review default worth suggesting over creating a new exercise. */
const LIKELY_SCORE = 0.75;

function targetText(parsed: ParsedExercise) {
  if (parsed.kind === "cardio") {
    return parsed.targetSeconds ? `${Math.round(parsed.targetSeconds / 60)} min` : "cardio";
  }
  if (parsed.kind === "time") {
    return `${parsed.targetSets} × ${parsed.targetSeconds ?? "—"}s${parsed.perSide ? " /side" : ""}`;
  }
  const reps =
    parsed.repMin == null
      ? "sets"
      : parsed.repMax && parsed.repMax !== parsed.repMin
        ? `${parsed.repMin}-${parsed.repMax}`
        : `${parsed.repMin}`;
  return `${parsed.targetSets} × ${reps}${parsed.perSide ? " /side" : ""}`;
}

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
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useReportActivity(pending, { label: "Importing" });

  // Weekday headers land where that weekday falls in this particular week.
  const weekStartsOn = useMemo(() => parseISO(weekStart).getDay(), [weekStart]);
  const parsed = useMemo(() => parseProgramText(text, { weekStartsOn }), [text, weekStartsOn]);

  /** Every parsed exercise paired with its best library match. */
  const matched = useMemo(() => {
    return parsed.days.map((day, dayIndex) => ({
      day,
      dayIndex,
      items: matchPasted(day.exercises, library).map((outcome, order) => ({
        ...outcome,
        key: `${dayIndex}:${order}`,
        order,
      })),
    }));
  }, [parsed, library]);

  const allItems = matched.flatMap((d) => d.items);
  const autoMatched = allItems.filter((i) => i.matched).length;
  const needsReview = allItems.length - autoMatched;

  /**
   * A confident match is taken. An unsure line with a strong candidate (a tie
   * between "Barbell Step Ups" and "Dumbbell Step Ups") starts on that
   * candidate rather than a near-duplicate of it; anything weaker is kept as
   * the user's own exercise rather than silently dropped. Every default is
   * flagged and can be changed in the review.
   */
  function choiceFor(item: (typeof allItems)[number]): Choice {
    const best = item.candidates[0];
    return (
      choices[item.key] ??
      (item.matched
        ? { kind: "library", id: item.matched.id }
        : best && best.score >= LIKELY_SCORE
          ? { kind: "library", id: best.exercise.id }
          : { kind: "new", muscle: guessMuscle(item.parsed.name, null) })
    );
  }

  function choose(key: string, choice: Choice) {
    setChoices((prev) => ({ ...prev, [key]: choice }));
  }

  function apply() {
    setError(null);
    const days = matched.map(({ day, items }) => ({
      dayIndex: day.dayIndex,
      name: day.name,
      focusNote: day.focusNote,
      isRest: day.isRest,
      exercises: items.flatMap((item) => {
        const choice = choiceFor(item);
        if (choice.kind === "skip") return [];
        return [
          {
            exerciseId: choice.kind === "library" ? choice.id : null,
            newExercise:
              choice.kind === "new"
                ? {
                    name: item.parsed.name.slice(0, 80),
                    primaryMuscle: choice.muscle,
                    equipment: guessEquipment(item.parsed.name),
                    tracking: item.parsed.kind,
                  }
                : null,
            targetSets: item.parsed.targetSets,
            repMin: item.parsed.repMin,
            repMax: item.parsed.repMax,
            targetSeconds: item.parsed.targetSeconds,
            perSide: item.parsed.perSide,
            note: item.parsed.note?.slice(0, 200) ?? null,
          },
        ];
      }),
    }));

    if (days.every((d) => d.exercises.length === 0)) {
      setError("Nothing to import — every line was skipped.");
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
            className="w-full resize-y rounded-xl border border-line bg-[#0a0c0d] p-3.5 font-mono text-base leading-[1.75] text-fg-muted outline-none placeholder:text-fg-faint focus:border-line-hi sm:text-xs"
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
              <p className="text-xs leading-[1.6] text-fg-soft">
                One exercise per line — <code className="font-mono">3 × 8–12</code>,{" "}
                <code className="font-mono">3 × 10 each</code>,{" "}
                <code className="font-mono">3 × 45 sec</code>,{" "}
                <code className="font-mono">Cardio: 15 min bike</code>. Headers like{" "}
                <code className="font-mono">Monday - Upper A</code> or{" "}
                <code className="font-mono">DAY 1 — UPPER A</code> split the week.
              </p>
            )}
          </div>
          {text.trim() && parsed.issues.length > 0 ? (
            <ul className="mt-2.5 flex flex-col gap-1 font-mono text-[11px] text-fg-dim">
              {parsed.issues.slice(0, 5).map((issue) => (
                <li key={issue.line}>
                  Line {issue.line} not read: <span className="text-fg-soft">{issue.raw}</span>
                </li>
              ))}
            </ul>
          ) : null}
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
                    const choice = choiceFor(item);
                    const options = item.candidates.length
                      ? item.candidates
                      : findCandidates(item.parsed.name, library, 4);
                    const value =
                      choice.kind === "library" ? choice.id : choice.kind === "new" ? NEW_VALUE : "";

                    return (
                      <div
                        key={item.key}
                        className={cn(
                          "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[10px] border px-3 py-2",
                          choice.kind === "skip"
                            ? "border-line bg-surface-2 opacity-50"
                            : choice.kind === "library" && item.matched?.id === choice.id
                              ? "border-line bg-surface-2"
                              : "border-warn/40 bg-warn-soft/40",
                        )}
                      >
                        {choice.kind === "library" ? (
                          <Check className="size-3.5 flex-none text-accent" strokeWidth={2.5} />
                        ) : choice.kind === "new" ? (
                          <Plus className="size-3.5 flex-none text-warn" strokeWidth={2.5} />
                        ) : (
                          <AlertTriangle className="size-3.5 flex-none text-fg-dim" strokeWidth={2} />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold sm:w-[168px] sm:flex-none">
                          {item.parsed.name}
                        </span>
                        <span className="flex-none font-mono text-[10.5px] text-fg-dim">
                          {targetText(item.parsed)}
                        </span>
                        <select
                          value={value}
                          onChange={(e) => {
                            const next = e.target.value;
                            choose(
                              item.key,
                              next === NEW_VALUE
                                ? { kind: "new", muscle: guessMuscle(item.parsed.name, null) }
                                : next
                                  ? { kind: "library", id: next }
                                  : { kind: "skip" },
                            );
                          }}
                          aria-label={`Library match for ${item.parsed.name}`}
                          className="w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-base text-fg-2 outline-none focus:border-line-hi sm:ml-auto sm:w-auto sm:flex-1 sm:text-[12px]"
                        >
                          {options.map((c) => (
                            <option key={c.exercise.id} value={c.exercise.id}>
                              {c.exercise.name} ({Math.round(c.score * 100)}%)
                            </option>
                          ))}
                          <option value={NEW_VALUE}>＋ Add “{item.parsed.name}” as my own</option>
                          <option value="">Skip this line</option>
                        </select>
                        {choice.kind === "new" ? (
                          <label className="flex w-full items-center gap-2 text-[11.5px] text-fg-soft">
                            New exercise · works
                            <select
                              value={choice.muscle}
                              onChange={(e) =>
                                choose(item.key, { kind: "new", muscle: e.target.value as Muscle })
                              }
                              aria-label={`Main muscle for ${item.parsed.name}`}
                              className="rounded-lg border border-line bg-surface px-2 py-1 text-base text-fg-2 outline-none focus:border-line-hi sm:text-[12px]"
                            >
                              {MUSCLES.map((m) => (
                                <option key={m} value={m}>
                                  {MUSCLE_LABELS[m]}
                                </option>
                              ))}
                            </select>
                            <span className="text-fg-dim">
                              · logged as {item.parsed.kind === "reps" ? "weight × reps" : item.parsed.kind === "time" ? "time held" : "cardio"}
                            </span>
                          </label>
                        ) : null}
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

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
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
              This replaces every day in {weekLabel}; days the paste leaves out become rest days.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
