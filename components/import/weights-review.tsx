"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { X } from "lucide-react";
import { importBodyWeights } from "@/app/actions/import";
import type { BodyMassScan } from "@/lib/import/apple-health";
import { chunk } from "@/lib/import/batches";
import type { UnitSystem } from "@/lib/database.types";
import { formatWeight, weightUnit } from "@/lib/units";
import { useReportActivity } from "@/lib/activity";
import { Message } from "@/components/profile/controls";
import { ProgressBar, RunButton, useWarnBeforeLeaving } from "./progress";

type Run =
  | { state: "idle" }
  | { state: "running"; done: number }
  | { state: "finished"; added: number; filled: number; kept: number }
  | { state: "failed"; error: string; saved: number };

/** A thousand days a call is about 60 KB — far inside the body limit. */
const PER_CALL = 1000;
const count = (n: number) => n.toLocaleString();

export function WeightsReview({
  fileName,
  scan,
  system,
  onClose,
}: {
  fileName: string;
  scan: BodyMassScan;
  system: UnitSystem;
  onClose: () => void;
}) {
  const [run, setRun] = useState<Run>({ state: "idle" });
  const running = run.state === "running";
  useReportActivity(running, { mode: "soft", label: "Importing" });
  useWarnBeforeLeaving(running);

  const { entries } = scan;
  const first = entries[0];
  const last = entries.at(-1);

  async function start() {
    let added = 0;
    let filled = 0;
    let kept = 0;
    try {
      setRun({ state: "running", done: 0 });
      for (const part of chunk(entries, PER_CALL)) {
        const result = await importBodyWeights(part);
        if (result.error !== undefined) {
          setRun({ state: "failed", error: result.error, saved: added + filled });
          return;
        }
        added += result.added;
        filled += result.filled;
        kept += result.kept;
        setRun({ state: "running", done: added + filled + kept });
      }
      setRun({ state: "finished", added, filled, kept });
    } catch (error) {
      setRun({
        state: "failed",
        error: error instanceof Error ? error.message : "The connection dropped.",
        saved: added + filled,
      });
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">Body weight from Apple Health</h2>
          <p className="mt-0.5 truncate font-mono text-[10.5px] text-fg-dim">{fileName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={running}
          aria-label="Close the import"
          className="ml-auto rounded p-1 text-fg-dim hover:text-fg disabled:opacity-40"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>

      {entries.length === 0 ? (
        <Message
          error={
            scan.records > 0
              ? "Health had body-weight records, but none we could use — they were outside 20–400 kg or in a unit we don't know."
              : "There's no body weight in this export. Health only includes weights from apps and scales you've allowed to write to it."
          }
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <div>
              <dt className="eyebrow">Days with a weight</dt>
              <dd className="mt-1 font-mono text-[15px] font-extrabold">{count(entries.length)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Dates</dt>
              <dd className="mt-1 font-mono text-[15px] font-extrabold">
                {format(parseISO(first!.date), "MMM yyyy")} – {format(parseISO(last!.date), "MMM yyyy")}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Latest</dt>
              <dd className="mt-1 font-mono text-[15px] font-extrabold">
                {formatWeight(last!.weightKg, system)}
                <span className="ml-1 text-[10px] text-fg-dim">{weightUnit(system)}</span>
              </dd>
            </div>
          </dl>
          <ul className="mt-3 flex flex-col gap-1 text-[12px] leading-[1.5] text-fg-soft">
            <li>
              One weight per day — the last one Health has for that day.
              {scan.records > entries.length ? ` (${count(scan.records)} readings in all.)` : ""}
            </li>
            <li>Days you&apos;ve already logged a weight for keep yours.</li>
            {scan.outOfRange + scan.unreadable > 0 ? (
              <li>{count(scan.outOfRange + scan.unreadable)} readings left out as impossible or unreadable.</li>
            ) : null}
          </ul>

          <div className="mt-5 flex flex-col gap-3">
            {run.state === "running" ? (
              <ProgressBar value={run.done / entries.length} label={`${count(run.done)} of ${count(entries.length)} days`} />
            ) : null}
            {run.state === "failed" ? (
              <Message
                error={`${run.error} ${run.saved ? `${count(run.saved)} days were saved before that; running it again won't double them.` : "Nothing was saved."}`}
              />
            ) : null}
            {run.state === "finished" ? (
              <Message
                notice={
                  `Added ${count(run.added)} weigh-ins` +
                  (run.filled ? `, and a weight beside ${count(run.filled)} days of measurements` : "") +
                  (run.kept ? `. ${count(run.kept)} days already had your weight and kept it.` : ".")
                }
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2.5">
              {run.state === "finished" ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-[11px] bg-accent px-[18px] py-3 text-[13px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
                >
                  Done
                </button>
              ) : (
                <RunButton running={running} onClick={() => void start()} runningLabel="Importing…">
                  Import {count(entries.length)} days
                </RunButton>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
