"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { revertSnapshot } from "@/app/actions/ai-coach";
import { useAction } from "@/lib/use-action";
import type { DecisionView, RunView, SnapshotView } from "@/lib/ai-coach/view";
import { cn } from "@/lib/utils";
import { Notice, Spinner } from "./ui";

const KIND: Record<RunView["kind"], string> = { plan: "Design", refine: "Refine", review: "Review" };

/** The paper trail: what can be reverted, what was decided, and every run. */
export function HistoryPanel({
  snapshots,
  decisions,
  runs,
  onDone,
}: {
  snapshots: SnapshotView[];
  decisions: DecisionView[];
  runs: RunView[];
  onDone: (notice: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Section title="Applied changes" hint="Revert puts the week back exactly as it was before. Logged sessions are never touched.">
        {snapshots.length === 0 ? (
          <Empty>Nothing applied yet.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {snapshots.map((snapshot, i) => (
              <SnapshotRow key={snapshot.id} snapshot={snapshot} newest={i === 0} onDone={onDone} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Decisions">
        {decisions.length === 0 ? (
          <Empty>No decisions yet.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {decisions.map((decision) => (
              <li key={decision.id} className="py-2.5">
                <div className="flex items-baseline gap-2.5">
                  <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-fg-2">{decision.text}</span>
                  <time className="flex-none font-mono text-[10.5px] text-fg-dim">
                    {format(parseISO(decision.at), "MMM d, HH:mm")}
                  </time>
                </div>
                {decision.details.length ? (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {decision.details.map((line, i) => (
                      <li
                        key={i}
                        className={cn(
                          "text-[11.5px] leading-[1.45]",
                          line.startsWith("✓") ? "text-fg-muted" : "text-fg-dim",
                        )}
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Runs" hint="Every request sent to the model, including the ones that failed.">
        {runs.length === 0 ? (
          <Empty>No runs yet.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {runs.map((run) => (
              <li key={run.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="text-[12.5px] font-semibold text-fg-2">{KIND[run.kind]}</span>
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase",
                      run.status === "succeeded" && "border-line-hi bg-accent-soft text-accent",
                      run.status === "failed" && "border-danger-border bg-danger-soft text-danger",
                      run.status === "running" && "border-line bg-surface-2 text-fg-dim",
                    )}
                  >
                    {run.status}
                  </span>
                  <time className="ml-auto font-mono text-[10.5px] text-fg-dim">
                    {format(parseISO(run.createdAt), "MMM d, HH:mm")}
                  </time>
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-fg-dim">
                  {run.model}
                  {run.inputTokens != null || run.outputTokens != null
                    ? ` · ${(run.inputTokens ?? 0).toLocaleString()} in / ${(run.outputTokens ?? 0).toLocaleString()} out`
                    : ""}
                </div>
                {run.error ? <p className="mt-1 text-[11.5px] leading-[1.45] text-danger">{run.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function SnapshotRow({
  snapshot,
  newest,
  onDone,
}: {
  snapshot: SnapshotView;
  newest: boolean;
  onDone: (notice: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction({ announce: "block", label: "Reverting" });
  const week = format(parseISO(snapshot.weekStart), "MMM d");

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-fg-2">
            {snapshot.what} · week of {week}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-fg-dim">
            {format(parseISO(snapshot.createdAt), "MMM d, HH:mm")}
            {snapshot.revertedAt ? ` · reverted ${format(parseISO(snapshot.revertedAt), "MMM d, HH:mm")}` : ""}
          </div>
        </div>
        {!snapshot.revertedAt && !confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="min-h-10 flex-none rounded-[10px] border border-stroke bg-ghost px-3.5 text-[12px] font-semibold text-fg-2 hover:bg-hover"
          >
            Revert
          </button>
        ) : null}
      </div>
      {confirming ? (
        <div className="mt-2.5 rounded-[12px] border border-warn/40 bg-warn-soft p-3">
          <p className="text-[12px] leading-[1.5] text-fg-muted">
            Put the week of {week} back as it was before this change?
            {newest ? "" : " Anything changed in that week since — by you or the AI Coach — is replaced too."} Logged
            sessions stay as they are.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={() =>
                run(async () => {
                  setError(null);
                  const result = await revertSnapshot(snapshot.id);
                  if (result.error) setError(result.error);
                  else {
                    setConfirming(false);
                    if (result.notice) onDone(result.notice);
                  }
                })
              }
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-warn px-3.5 py-2.5 text-[12px] font-bold text-[#0a0c0d] disabled:opacity-60"
            >
              <Spinner show={pending} />
              Revert it
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="rounded-[10px] border border-stroke bg-ghost px-3.5 py-2.5 text-[12px] font-semibold text-fg-2 disabled:opacity-60"
            >
              Keep it
            </button>
          </div>
          {error ? (
            <div className="mt-2.5">
              <Notice error={error} />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[18px] border border-line bg-surface p-4 sm:p-5">
      <h2 className="text-[14px] font-bold">{title}</h2>
      {hint ? <p className="mt-0.5 text-[11.5px] leading-[1.5] text-fg-dim">{hint}</p> : null}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-[12px] text-fg-dim">{children}</p>;
}
