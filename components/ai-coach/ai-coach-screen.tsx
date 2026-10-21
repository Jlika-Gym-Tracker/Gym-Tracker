"use client";

import { useState } from "react";
import { setAiCoachConsent } from "@/app/actions/ai-coach";
import { useAction } from "@/lib/use-action";
import type { AiCoachView } from "@/lib/ai-coach/view";
import { cn } from "@/lib/utils";
import { HistoryPanel } from "./history-panel";
import { IntakeForm } from "./intake-form";
import { PlanPreview } from "./plan-preview";
import { ReviewPanel } from "./review-panel";
import { Notice, Spinner, Tag, dangerButton, ghostButton } from "./ui";

type Tab = "plan" | "review" | "history";

/** The AI Coach, once this account has opted in. */
export function AiCoachScreen({ view }: { view: AiCoachView }) {
  const [tab, setTab] = useState<Tab>(view.review && !view.plan ? "review" : "plan");
  const [flash, setFlash] = useState<string | null>(null);
  const [editingIntake, setEditingIntake] = useState(false);
  const remaining = Math.max(0, view.dailyLimit - view.runsUsed);

  const done = (notice: string) => {
    setFlash(notice);
    setEditingIntake(false);
  };

  const tabs: { key: Tab; label: string; badge?: string }[] = [
    { key: "plan", label: "Design", badge: view.plan ? "Draft" : undefined },
    { key: "review", label: "Review", badge: view.review ? String(view.review.changes.length) : undefined },
    { key: "history", label: "History" },
  ];

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-4">
      <header className="rounded-[20px] border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Tag>AI Coach · on</Tag>
          {view.fixture ? <Tag tone="warn">Fixture mode</Tag> : null}
        </div>
        <p className="mt-3 max-w-[600px] text-[13px] leading-[1.55] text-fg-muted">
          Drafts a week from your answers and reviews what you logged. Nothing changes in your program until
          you approve it, and every apply can be reverted.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-fg-dim uppercase">
          <span>
            <span className={cn("font-bold", remaining > 0 ? "text-accent" : "text-warn")}>{remaining}</span> of{" "}
            {view.dailyLimit} runs left · 24 h
          </span>
          <span className="normal-case">{view.model}</span>
        </div>
        <TurnOff />
      </header>

      {flash ? (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Notice notice={flash} />
          </div>
          <button
            type="button"
            onClick={() => setFlash(null)}
            aria-label="Dismiss message"
            className="min-h-10 rounded-[10px] px-2 font-mono text-[11px] text-fg-dim hover:text-fg"
          >
            ✕
          </button>
        </div>
      ) : null}

      <nav aria-label="AI Coach sections" className="grid grid-cols-3 gap-1 rounded-[13px] border border-line bg-surface-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] px-2 text-[12.5px] font-semibold transition-colors",
              tab === t.key ? "bg-surface text-fg shadow-[0_0_0_1px_var(--border-hi)]" : "text-fg-soft hover:text-fg-2",
            )}
          >
            <span className="truncate">{t.label}</span>
            {t.badge ? (
              <span className="flex-none rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-accent uppercase">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {tab === "plan" ? (
        view.plan && !editingIntake ? (
          <>
            <PlanPreview
              key={view.plan.proposalId}
              plan={view.plan}
              dayLabels={view.dayLabels}
              thisWeek={view.thisWeek}
              nextWeek={view.nextWeek}
              remaining={remaining}
              onDone={done}
            />
            <button type="button" onClick={() => setEditingIntake(true)} className={cn(ghostButton, "self-start")}>
              Start over with new answers
            </button>
          </>
        ) : (
          <div className="rounded-[18px] border border-line bg-surface p-4 sm:p-5">
            <h2 className="text-[15px] font-bold">Design a week</h2>
            <p className="mt-1 mb-5 max-w-[560px] text-[12.5px] leading-[1.55] text-fg-muted">
              A few questions, then a complete week built only from movements in your library. You see it
              before anything is saved, can ask for changes in plain words, and choose where it goes.
            </p>
            <IntakeForm
              initial={view.intake ?? view.intakeDefaults}
              dayLabels={view.dayLabels}
              remaining={remaining}
              onDone={done}
            />
          </div>
        )
      ) : null}

      {tab === "review" ? (
        <ReviewPanel
          key={view.review?.proposalId ?? "none"}
          review={view.review}
          thisWeek={view.thisWeek}
          nextWeek={view.nextWeek}
          remaining={remaining}
          onDone={done}
        />
      ) : null}

      {tab === "history" ? (
        <HistoryPanel snapshots={view.snapshots} decisions={view.decisions} runs={view.runs} onDone={done} />
      ) : null}
    </div>
  );
}

/** Withdrawing consent: stop sending, optionally forget everything kept here. */
function TurnOff() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const off = useAction({ announce: "block", label: "Turning off the AI Coach" });
  const erase = useAction({ announce: "block", label: "Deleting AI Coach history" });
  const busy = off.pending || erase.pending;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 min-h-9 font-mono text-[10.5px] font-semibold text-fg-dim uppercase underline-offset-4 hover:text-fg-soft hover:underline"
      >
        Turn off the AI Coach
      </button>
    );
  }

  const withdraw = (deleteHistory: boolean) => async () => {
    setError(null);
    const result = await setAiCoachConsent(false, deleteHistory);
    if (result.error) setError(result.error);
  };

  return (
    <div className="mt-3 rounded-[14px] border border-line bg-surface-2 p-3.5">
      <p className="text-[12.5px] leading-[1.5] text-fg-muted">
        Nothing more is sent to Anthropic once it&apos;s off. Weeks you already accepted stay in your program.
        You can also delete the intake, drafts, reviews and snapshots kept here — that removes the option to
        revert.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          aria-busy={off.pending || undefined}
          onClick={() => off.run(withdraw(false))}
          className={ghostButton}
        >
          <Spinner show={off.pending} />
          Turn off
        </button>
        <button
          type="button"
          disabled={busy}
          aria-busy={erase.pending || undefined}
          onClick={() => erase.run(withdraw(true))}
          className={dangerButton}
        >
          <Spinner show={erase.pending} />
          Turn off and delete history
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="min-h-10 px-2 text-[12.5px] font-semibold text-fg-soft hover:text-fg"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <div className="mt-2.5">
          <Notice error={error} />
        </div>
      ) : null}
    </div>
  );
}
