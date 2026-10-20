"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Check, Plus, X } from "lucide-react";
import {
  createImportExercises,
  findLoggedStarts,
  getImportLibrary,
  importBodyWeights,
  importWorkoutBatch,
  type ExerciseSpec,
  type ImportLibraryExercise,
} from "@/app/actions/import";
import { AUTO_MATCH_THRESHOLD, findCandidates, type MatchCandidate } from "@/lib/program/match";
import { parseHistoryFile } from "@/lib/import/backup";
import { chunk, chunkPayloads, minuteKey, sessionTimes, toPayloads } from "@/lib/import/batches";
import {
  EQUIPMENT, EQUIPMENT_LABELS, guessEquipment, guessMuscle, guessTracking,
  MUSCLES, MUSCLE_LABELS, TRACKING, TRACKING_LABELS,
} from "@/lib/import/guess";
import { exerciseKey, FORMAT_LABELS, type ExerciseSummary } from "@/lib/import/types";
import type { Equipment, Muscle, Tracking, UnitSystem } from "@/lib/database.types";
import { useReportActivity } from "@/lib/activity";
import { Message, Segmented } from "@/components/profile/controls";
import { cn } from "@/lib/utils";
import { ProgressBar, RunButton, useWarnBeforeLeaving } from "./progress";

/** What happens to every set filed under one name from the file. */
type Choice =
  | { kind: "match"; exerciseId: string }
  | { kind: "create"; muscle: Muscle; equipment: Equipment; tracking: Tracking }
  | { kind: "skip" };

type Row = {
  key: string;
  summary: ExerciseSummary;
  /** The name to show: a backup's library movement goes by its name here. */
  label: string;
  candidates: MatchCandidate[];
  /** Confident enough to take without asking; otherwise the default is to create it. */
  auto: boolean;
  fallback: Choice;
};

type Run =
  | { state: "idle" }
  | { state: "running"; done: number; total: number; label: string }
  | {
      state: "finished";
      imported: number;
      skipped: number;
      sets: number;
      created: number;
      weights: { added: number; filled: number; kept: number } | null;
    }
  | { state: "failed"; error: string; imported: number };

const count = (n: number) => n.toLocaleString();
const SELECT =
  "w-full min-w-0 rounded-[10px] border border-line bg-surface px-2.5 py-2 text-[12.5px] text-fg-2 outline-none focus:border-line-hi disabled:opacity-60";
/** Weigh-ins a call: a thousand days is about 60 KB. */
const WEIGHTS_PER_CALL = 1000;

function createGuess(summary: ExerciseSummary): Choice {
  // A backup knows how its own exercises were set up; nothing to guess.
  if (summary.ref?.kind === "own") {
    const { primaryMuscle: muscle, equipment, tracking } = summary.ref;
    return { kind: "create", muscle, equipment, tracking };
  }
  return {
    kind: "create",
    muscle: guessMuscle(summary.name, summary.category),
    equipment: guessEquipment(summary.name),
    tracking: guessTracking(summary),
  };
}

/**
 * A backup's exercise, found again: a library movement by id, then by slug;
 * one of your own by its name among your own. Not found, your own is added
 * back as it was, and a library movement this server doesn't have is left out
 * until you pick what to file it under.
 */
function backupRow(summary: ExerciseSummary, library: ImportLibraryExercise[]): Row | null {
  const ref = summary.ref;
  if (!ref) return null;
  const key = exerciseKey(summary);
  if (ref.kind === "library") {
    const found =
      library.find((e) => e.id === ref.id) ?? (ref.slug ? library.find((e) => e.slug === ref.slug) : undefined);
    const label = found?.name ?? summary.name;
    const near = findCandidates(label, library, 4).filter((c) => c.exercise.id !== found?.id);
    return {
      key,
      summary,
      label,
      candidates: found ? [{ exercise: found, score: 1 }, ...near.slice(0, 3)] : near,
      auto: !!found,
      fallback: found ? { kind: "match", exerciseId: found.id } : { kind: "skip" },
    };
  }
  const name = ref.name.trim().toLowerCase();
  const own = library.find((e) => e.own && e.name.trim().toLowerCase() === name);
  return {
    key,
    summary,
    label: summary.name,
    candidates: own ? [{ exercise: own, score: 1 }] : findCandidates(summary.name, library, 4),
    auto: !!own,
    fallback: own ? { kind: "match", exerciseId: own.id } : createGuess(summary),
  };
}

export function HistoryReview({
  fileName,
  text,
  system,
  onClose,
}: {
  fileName: string;
  text: string;
  system: UnitSystem;
  onClose: () => void;
}) {
  const [units, setUnits] = useState<UnitSystem>(system);
  // Re-read when the lifter says which unit an unlabelled file is in; parsing
  // is quick next to the read itself, and it keeps one conversion path.
  const parsed = useMemo(() => parseHistoryFile(text, { assumeUnits: units }), [text, units]);
  const history = parsed.ok ? parsed.history : null;

  const [library, setLibrary] = useState<ImportLibraryExercise[] | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getImportLibrary()
      .then((result) => {
        if (!live) return;
        if (result.error !== undefined) setLibraryError(result.error);
        else setLibrary(result.library);
      })
      .catch(() => live && setLibraryError("Couldn't load your exercise library. Check your connection and try again."));
    return () => {
      live = false;
    };
  }, []);

  // Start minutes of every workout in the file, as they will be stored.
  const startKeys = useMemo(
    () => history?.workouts.map((w) => minuteKey(sessionTimes(w).startedAt)) ?? [],
    [history],
  );
  const [firstStart, lastStart] = useMemo(() => {
    if (startKeys.length === 0) return [null, null];
    const sorted = [...startKeys].sort();
    return [sorted[0]!, sorted.at(-1)!];
  }, [startKeys]);

  const [logged, setLogged] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!firstStart || !lastStart) return;
    let live = true;
    // If the check fails the count just isn't shown; the server skips
    // already-logged workouts on its own either way.
    const settle = (starts: string[]) => live && setLogged(new Set(starts));
    findLoggedStarts(`${firstStart}:00.000Z`, `${lastStart}:00.000Z`)
      .then((result) => settle(result.error === undefined ? result.starts : []))
      .catch(() => settle([]));
    return () => {
      live = false;
    };
  }, [firstStart, lastStart]);

  const rows = useMemo<Row[]>(() => {
    if (!history || !library) return [];
    return history.exercises.map((summary) => {
      const restored = backupRow(summary, library);
      if (restored) return restored;
      const candidates = findCandidates(summary.name, library, 4);
      const best = candidates[0];
      const auto = !!best && best.score >= AUTO_MATCH_THRESHOLD;
      return {
        key: exerciseKey(summary),
        summary,
        label: summary.name,
        candidates,
        auto,
        fallback: auto ? { kind: "match", exerciseId: best.exercise.id } : createGuess(summary),
      };
    });
  }, [history, library]);

  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const choiceFor = (row: Row): Choice => choices[row.key] ?? row.fallback;
  const rowByKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  // The whole library as one set of <option>s, built once and shared by every
  // row's select rather than rebuilt per row.
  const libraryOptions = useMemo(
    () =>
      library ? (
        <optgroup label="Your whole library">
          {library.map((e) => (
            <option key={e.id} value={`m:${e.id}`}>
              {e.name}
              {e.own ? " (yours)" : ""}
            </option>
          ))}
        </optgroup>
      ) : null,
    [library],
  );

  const alreadyLogged = logged ? startKeys.filter((k) => logged.has(k)).length : null;
  const toImport = useMemo(() => {
    if (!history) return 0;
    return history.workouts.filter((w, i) => {
      if (logged?.has(startKeys[i]!)) return false;
      return w.exercises.some((e) => {
        const row = rowByKey.get(exerciseKey(e));
        return row ? (choices[row.key] ?? row.fallback).kind !== "skip" : false;
      });
    }).length;
  }, [history, logged, startKeys, rowByKey, choices]);

  const [run, setRun] = useState<Run>({ state: "idle" });
  const running = run.state === "running";
  useReportActivity(running, { mode: "soft", label: "Importing" });
  useWarnBeforeLeaving(running);

  if (!parsed.ok) {
    return (
      <Shell fileName={fileName} onClose={onClose} closable>
        <Message error={parsed.error} />
      </Shell>
    );
  }
  const h = parsed.history;
  const backup = h.format === "jlika";
  const weighIns = h.bodyWeights ?? [];
  const missing = rows.filter((r) => r.summary.ref?.kind === "library" && !r.auto).length;

  async function start() {
    if (!library) return;
    let imported = 0;
    try {
      setRun({ state: "running", done: 0, total: 1, label: "Adding your exercises" });

      const specs: ExerciseSpec[] = [];
      for (const row of rows) {
        const choice = choiceFor(row);
        // A backup run for its weigh-ins alone has no workouts to file under them.
        if (choice.kind === "create" && toImport > 0) {
          specs.push({
            name: row.summary.name,
            primaryMuscle: choice.muscle,
            equipment: choice.equipment,
            tracking: choice.tracking,
          });
        }
      }
      const createdIds: Record<string, string> = {};
      let created = 0;
      for (const part of chunk(specs, 200)) {
        const result = await createImportExercises(part);
        if (result.error !== undefined) throw new Error(result.error);
        Object.assign(createdIds, result.ids);
        created += result.created;
      }

      const resolve = (_name: string, key: string) => {
        const row = rowByKey.get(key);
        if (!row) return null;
        const choice = choiceFor(row);
        if (choice.kind === "match") return choice.exerciseId;
        if (choice.kind === "create") return createdIds[row.summary.name] ?? null;
        return null;
      };
      const app = FORMAT_LABELS[h.format].replace(/ \(.*\)$/, "");
      // A backup's untitled sessions were untitled in this app too; keep them so.
      const all = toPayloads(h.workouts, resolve, backup ? null : `${app} workout`);
      // Already-logged workouts aren't even sent; the server checks again anyway.
      const payloads = all.filter((p) => !logged?.has(minuteKey(p.startedAt)));
      let skipped = all.length - payloads.length;
      let sets = 0;

      let sent = 0;
      for (const batch of chunkPayloads(payloads)) {
        setRun({ state: "running", done: sent, total: payloads.length, label: `Workout ${count(sent + 1)} of ${count(payloads.length)}` });
        const result = await importWorkoutBatch(batch);
        if (result.error !== undefined) {
          setRun({ state: "failed", error: result.error, imported });
          return;
        }
        imported += result.imported;
        skipped += result.skipped;
        sets += result.sets;
        sent += batch.length;
      }

      // A backup's weigh-ins, after its workouts. A day that already has a
      // weight keeps it; the server checks every day again.
      let weights: { added: number; filled: number; kept: number } | null = null;
      if (weighIns.length) {
        weights = { added: 0, filled: 0, kept: 0 };
        for (const part of chunk(weighIns, WEIGHTS_PER_CALL)) {
          const done = weights.added + weights.filled + weights.kept;
          setRun({ state: "running", done, total: weighIns.length, label: `Weigh-ins · ${count(done)} of ${count(weighIns.length)}` });
          const result = await importBodyWeights(part);
          if (result.error !== undefined) {
            setRun({ state: "failed", error: result.error, imported });
            return;
          }
          weights.added += result.added;
          weights.filled += result.filled;
          weights.kept += result.kept;
        }
      }
      setRun({ state: "finished", imported, skipped, sets, created, weights });
    } catch (error) {
      setRun({
        state: "failed",
        error: error instanceof Error ? error.message : "The connection dropped.",
        imported,
      });
    }
  }

  const finished = run.state === "finished";

  return (
    <Shell fileName={fileName} onClose={onClose} closable={!running}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Stat label="From" value={FORMAT_LABELS[h.format]} />
        <Stat label="Workouts" value={count(h.workouts.length)} />
        <Stat label="Sets" value={count(h.setCount)} />
        <Stat
          label="Dates"
          value={
            h.from && h.to
              ? `${format(parseISO(h.from), "MMM yyyy")} – ${format(parseISO(h.to), "MMM yyyy")}`
              : "—"
          }
        />
      </dl>

      {h.workouts.length === 0 && !(backup && weighIns.length) ? (
        <div className="mt-3">
          <Message
            error={
              backup
                ? "This backup has no ticked-off sets or weigh-ins to bring back."
                : "Not a single set could be read from this file. The rows below say why."
            }
          />
        </div>
      ) : null}

      <ul className="mt-3 flex flex-col gap-1 text-[12px] leading-[1.5] text-fg-soft">
        {h.workouts.length === 0 ? null : alreadyLogged == null ? (
          <li>Checking which of these you already have…</li>
        ) : alreadyLogged > 0 ? (
          <li>
            <span className="text-accent-2">{count(alreadyLogged)} already in your log</span> — they&apos;ll be
            skipped, so importing again never doubles anything.
          </li>
        ) : null}
        {h.warmupsSkipped > 0 ? (
          <li>{count(h.warmupsSkipped)} warm-up sets left out — the file marks them as warm-ups.</li>
        ) : null}
        {h.emptySkipped > 0 ? <li>{count(h.emptySkipped)} rows with nothing recorded were left out.</li> : null}
        {h.workouts.some((w) => !w.timeStated) ? (
          <li>FitNotes saves dates but not times, so these sessions are placed at midday.</li>
        ) : null}
        {h.workouts.some((w) => w.durationS == null) ? (
          <li>Sessions without a recorded length are saved as an hour long.</li>
        ) : null}
        {h.untickedSkipped ? (
          <li>{count(h.untickedSkipped)} sets that were never ticked off are left out, as they are everywhere else.</li>
        ) : null}
        {backup ? (
          <li>
            Your own exercises are matched by name, or added back to your library as they were. Library ones are
            found by the id they have here.
          </li>
        ) : null}
        {weighIns.length ? (
          <li>
            {count(weighIns.length)} {weighIns.length === 1 ? "weigh-in" : "weigh-ins"} — a day you&apos;ve already
            logged a weight for keeps yours.
          </li>
        ) : null}
        {h.ignored?.length ? (
          <li>
            Left alone, not restored: {h.ignored.join(", ")}.
          </li>
        ) : null}
      </ul>

      {!h.unitsStated ? (
        <div className="mt-4 rounded-[12px] border border-warn/40 bg-warn-soft/40 p-3">
          <p className="mb-2 text-[12.5px] leading-[1.5] text-fg-2">
            This file doesn&apos;t say whether its weights are in kg or lb — Strong uses whatever the app was set
            to. Which was it?
          </p>
          <Segmented
            label="Units in this file"
            value={units}
            onChange={(next) => !running && setUnits(next)}
            options={[
              { value: "metric" as const, label: "kg and km" },
              { value: "imperial" as const, label: "lb and miles" },
            ]}
          />
        </div>
      ) : null}

      <div className="mt-5 mb-2 flex items-baseline gap-2">
        <span className="eyebrow">Exercises · {count(h.exercises.length)}</span>
        {rows.length ? (
          <span className="ml-auto font-mono text-[10.5px] text-fg-dim uppercase">
            <span className="text-accent-2">{rows.filter((r) => r.auto).length} matched</span>
            {" · "}
            {rows.filter((r) => !r.auto).length - missing} new
            {missing ? <span className="text-warn"> · {missing} not in this library</span> : null}
          </span>
        ) : null}
      </div>

      {libraryError ? (
        <Message error={libraryError} />
      ) : !library ? (
        <p className="py-4 text-[12.5px] text-fg-dim">Matching names against your library…</p>
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto pr-1 lg:max-h-[480px]">
          {rows.map((row) => {
            const choice = choiceFor(row);
            const value = choice.kind === "match" ? `m:${choice.exerciseId}` : choice.kind;
            return (
              <div
                key={row.key}
                className={cn(
                  "rounded-[12px] border px-3 py-2.5",
                  choice.kind === "skip"
                    ? "border-line bg-surface-2 opacity-60"
                    : choice.kind === "match"
                      ? "border-line bg-surface-2"
                      : "border-warn/40 bg-warn-soft/30",
                )}
              >
                <div className="flex items-start gap-2">
                  {choice.kind === "match" ? (
                    <Check className="mt-0.5 size-3.5 flex-none text-accent" strokeWidth={2.5} />
                  ) : choice.kind === "create" ? (
                    <Plus className="mt-0.5 size-3.5 flex-none text-warn" strokeWidth={2.5} />
                  ) : (
                    <X className="mt-0.5 size-3.5 flex-none text-fg-dim" strokeWidth={2.5} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{row.label}</div>
                    <div className="font-mono text-[10.5px] text-fg-dim">
                      {count(row.summary.sets)} sets · {count(row.summary.workouts)} workouts
                      {row.summary.category ? ` · ${row.summary.category}` : ""}
                    </div>
                  </div>
                </div>

                <select
                  value={value}
                  disabled={running || finished}
                  aria-label={`What to file ${row.label} under`}
                  onChange={(e) => {
                    const next = e.target.value;
                    setChoices((prev) => ({
                      ...prev,
                      [row.key]:
                        next === "skip"
                          ? { kind: "skip" }
                          : next === "create"
                            ? choice.kind === "create"
                              ? choice
                              : createGuess(row.summary)
                            : { kind: "match", exerciseId: next.slice(2) },
                    }));
                  }}
                  className={cn(SELECT, "mt-2")}
                >
                  {row.candidates.length ? (
                    <optgroup label="Closest matches">
                      {row.candidates.map((c) => (
                        <option key={c.exercise.id} value={`m:${c.exercise.id}`}>
                          {c.exercise.name} ({Math.round(c.score * 100)}%)
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  <option value="create">Add it to my library as a new exercise</option>
                  <option value="skip">Leave these sets out</option>
                  {libraryOptions}
                </select>

                {choice.kind === "create" ? (
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <LabelledSelect
                      label="Muscle"
                      value={choice.muscle}
                      disabled={running || finished}
                      options={MUSCLES.map((m) => ({ value: m, label: MUSCLE_LABELS[m] }))}
                      onChange={(muscle) => setChoices((prev) => ({ ...prev, [row.key]: { ...choice, muscle } }))}
                    />
                    <LabelledSelect
                      label="Equipment"
                      value={choice.equipment}
                      disabled={running || finished}
                      options={EQUIPMENT.map((e) => ({ value: e, label: EQUIPMENT_LABELS[e] }))}
                      onChange={(equipment) => setChoices((prev) => ({ ...prev, [row.key]: { ...choice, equipment } }))}
                    />
                    <LabelledSelect
                      label="Logged as"
                      value={choice.tracking}
                      disabled={running || finished}
                      options={TRACKING.map((t) => ({ value: t, label: TRACKING_LABELS[t] }))}
                      onChange={(tracking) => setChoices((prev) => ({ ...prev, [row.key]: { ...choice, tracking } }))}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {h.issueCount > 0 ? (
        <details className="mt-4 rounded-[12px] border border-line bg-surface-2 px-3 py-2.5">
          <summary className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-fg-2">
            <AlertTriangle className="size-3.5 flex-none text-warn" strokeWidth={2} />
            {count(h.issueCount)}{" "}
            {backup
              ? h.issueCount === 1
                ? "entry needs"
                : "entries need"
              : h.issueCount === 1
                ? "row needs"
                : "rows need"}{" "}
            a look
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-[12px] leading-[1.5] text-fg-soft">
            {h.issues.map((issue) => (
              <li key={issue.row}>{issue.message}</li>
            ))}
            {h.issueCount > h.issues.length ? (
              <li className="text-fg-dim">…and {count(h.issueCount - h.issues.length)} more like these.</li>
            ) : null}
          </ul>
        </details>
      ) : null}

      <div className="mt-5 flex flex-col gap-3">
        {run.state === "running" ? <ProgressBar value={run.done / Math.max(1, run.total)} label={run.label} /> : null}
        {run.state === "failed" ? (
          <Message
            error={
              `${run.error} ` +
              (run.imported > 0
                ? `${count(run.imported)} workouts made it in before that. Run the import again to add the rest — those are skipped, not doubled.`
                : "Nothing was imported. Try again in a moment.")
            }
          />
        ) : null}
        {run.state === "finished" ? (
          <Message
            notice={(
              (run.imported === 0
                ? h.workouts.length
                  ? "No new workouts — every one in this file is already in your log."
                  : ""
                : `Imported ${count(run.imported)} workouts and ${count(run.sets)} sets` +
                  (run.created ? `, and added ${count(run.created)} exercises to your library` : "") +
                  (run.skipped ? `. ${count(run.skipped)} were already logged and left alone.` : ".")) +
              (run.weights
                ? ` ${count(run.weights.added + run.weights.filled)} weigh-ins added` +
                  (run.weights.kept ? `; ${count(run.weights.kept)} days already had your weight and kept it.` : ".")
                : "")
            ).trim()}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2.5">
          {finished ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-[11px] bg-accent px-[18px] py-3 text-[13px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
            >
              Done
            </button>
          ) : (
            <RunButton
              running={running}
              disabled={!library || (toImport === 0 && weighIns.length === 0)}
              onClick={() => void start()}
              runningLabel="Importing…"
            >
              {toImport === 0
                ? weighIns.length
                  ? `Import ${count(weighIns.length)} weigh-ins`
                  : "Nothing new to import"
                : `Import ${count(toImport)} workouts` +
                  (weighIns.length ? ` and ${count(weighIns.length)} weigh-ins` : "")}
            </RunButton>
          )}
          {!running && !finished ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-[11px] border border-stroke bg-ghost px-4 py-3 text-[13px] font-semibold text-fg-2 hover:bg-hover"
            >
              Choose another file
            </button>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  fileName,
  onClose,
  closable,
  children,
}: {
  fileName: string;
  onClose: () => void;
  closable: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">Review the import</h2>
          <p className="mt-0.5 truncate font-mono text-[10.5px] text-fg-dim">{fileName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={!closable}
          aria-label="Close the import"
          className="ml-auto rounded p-1 text-fg-dim hover:text-fg disabled:opacity-40"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 truncate font-mono text-[15px] font-extrabold">{value}</dd>
    </div>
  );
}

function LabelledSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block font-mono text-[9.5px] tracking-[0.08em] text-fg-dim uppercase">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={SELECT}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
