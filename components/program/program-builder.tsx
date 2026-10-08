"use client";

import { useActionState, useState } from "react";
import { ClipboardPaste, Copy, LayoutTemplate, Upload } from "lucide-react";
import {
  copyLastWeek,
  publishWeek,
  unpublishWeek,
  type ActionState,
} from "@/app/actions/program";
import type { WeekDetail } from "@/lib/program/queries";
import type { LibraryExercise } from "@/lib/program/match";
import type { MuscleLoad } from "@/lib/program/volume";
import { weekRangeLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { HeroBackdrop } from "@/components/kit/hero-backdrop";
import { DayCard } from "./day-card";
import { LibraryPanel } from "./library-panel";
import { LoadCheck } from "./load-check";
import { PastePanel } from "./paste-panel";
import { TemplatePicker } from "./template-picker";
import { ActionButton } from "@/components/kit/action-button";

export function ProgramBuilder({
  week,
  library,
  load,
  hasEarlierWeek,
}: {
  week: WeekDetail;
  library: LibraryExercise[];
  load: MuscleLoad[];
  hasEarlierWeek: boolean;
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  // Default on: the whole point of copying is to carry progress, not repeat a week.
  const [progressLoads, setProgressLoads] = useState(true);
  const firstTrainingDay = week.days.find((d) => !d.is_rest) ?? week.days[0];
  const [activeDayId, setActiveDayId] = useState<string | null>(
    firstTrainingDay?.id ?? null,
  );

  const [publishState, publish] = useActionState(publishWeek, {} as ActionState);
  const [unpublishState, unpublish] = useActionState(unpublishWeek, {} as ActionState);
  const [copyState, copy] = useActionState(copyLastWeek, {} as ActionState);

  const activeDay = week.days.find((d) => d.id === activeDayId) ?? null;
  const message =
    publishState.error ?? copyState.error ?? unpublishState.error ??
    publishState.notice ?? copyState.notice ?? unpublishState.notice;
  const isError = Boolean(publishState.error ?? copyState.error ?? unpublishState.error);
  const published = week.status === "published";

  return (
    <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <header className="relative flex flex-wrap items-center gap-3.5 overflow-hidden rounded-[18px] border border-line bg-surface p-5">
          <HeroBackdrop
            images={week.days.flatMap((d) =>
              d.exercises.map((e) => e.exercise.image_start_url),
            )}
          />
          <div className="relative min-w-0">
            <h1 className="truncate text-base font-bold tracking-[-0.01em]">
              {week.label}
            </h1>
            <p className="mt-1 font-mono text-[11px] text-fg-dim uppercase">
              {weekRangeLabel(week.week_start)} · {week.status}
              {week.assigned_by_coach_id ? " · from your coach" : ""}
            </p>
          </div>

          <div className="relative ml-auto flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => {
                setShowTemplates((v) => !v);
                setShowPaste(false);
              }}
              className={cn(
                "flex items-center gap-2 rounded-[10px] border px-4 py-[11px] text-[13px] font-semibold transition-colors",
                showTemplates
                  ? "border-line-sel bg-accent-soft text-accent"
                  : "border-stroke bg-ghost text-fg-2 hover:bg-hover",
              )}
            >
              <LayoutTemplate className="size-3.5" strokeWidth={2} />
              Template
            </button>

            <button
              type="button"
              onClick={() => {
                setShowPaste((v) => !v);
                setShowTemplates(false);
              }}
              className={cn(
                "flex items-center gap-2 rounded-[10px] border px-4 py-[11px] text-[13px] font-semibold transition-colors",
                showPaste
                  ? "border-line-sel bg-accent-soft text-accent"
                  : "border-stroke bg-ghost text-fg-2 hover:bg-hover",
              )}
            >
              <ClipboardPaste className="size-3.5" strokeWidth={2} />
              Paste program
            </button>

            <div className="flex flex-col gap-1.5">
              <form action={copy} className="flex items-stretch">
                <input type="hidden" name="weekStart" value={week.week_start} />
                {progressLoads ? <input type="hidden" name="applyProgression" value="on" /> : null}
                <ActionButton
                  disabled={!hasEarlierWeek}
                  title={hasEarlierWeek ? undefined : "No earlier week to copy yet"}
                  className="flex items-center gap-2 rounded-[10px] border border-stroke bg-ghost px-4 py-[11px] text-[13px] font-semibold text-fg-2 transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Copy className="size-3.5" strokeWidth={2} />
                  Copy last week
                </ActionButton>
              </form>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 pl-1 font-mono text-[10px] tracking-[0.06em] uppercase",
                  hasEarlierWeek ? "text-fg-dim" : "pointer-events-none opacity-40",
                )}
                title="Steps each load up where last week cleared its rep range with reps to spare"
              >
                <input
                  type="checkbox"
                  checked={progressLoads}
                  onChange={(e) => setProgressLoads(e.target.checked)}
                  className="size-3 accent-[#c9f24d]"
                />
                Step loads up
              </label>
            </div>

            <form action={published ? unpublish : publish}>
              <input type="hidden" name="weekId" value={week.id} />
              <ActionButton
                className={cn(
                  "flex items-center gap-2 rounded-[10px] px-[18px] py-[11px] text-[13px] font-bold transition-colors",
                  published
                    ? "border border-line-sel bg-accent-soft text-accent hover:bg-hover"
                    : "bg-accent text-[#0a0c0d] hover:bg-accent-hi",
                )}
              >
                <Upload className="size-3.5" strokeWidth={2.5} />
                {published ? "Published — revert to draft" : "Publish week"}
              </ActionButton>
            </form>
          </div>

          {message ? (
            <p
              className={cn(
                "relative w-full rounded-[10px] border px-3 py-2 text-xs",
                isError
                  ? "border-danger-border bg-danger-soft text-danger"
                  : "border-line-hi bg-accent-soft text-accent",
              )}
            >
              {message}
            </p>
          ) : null}
        </header>

        {showTemplates ? (
          <TemplatePicker
            weekStart={week.week_start}
            onDone={() => setShowTemplates(false)}
          />
        ) : null}

        {showPaste ? (
          <PastePanel
            weekStart={week.week_start}
            weekLabel={week.label}
            library={library}
            onClose={() => setShowPaste(false)}
          />
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {week.days
            .filter((d) => !d.is_rest || d.exercises.length > 0)
            .map((day) => (
              <DayCard
                key={day.id}
                day={day}
                weekStart={week.week_start}
                active={day.id === activeDayId}
                onActivate={() => setActiveDayId(day.id)}
              />
            ))}
        </div>

        {week.days.some((d) => d.is_rest && d.exercises.length === 0) ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-line bg-surface-2 px-4 py-3">
            <span className="eyebrow">Rest days</span>
            {week.days
              .filter((d) => d.is_rest && d.exercises.length === 0)
              .map((day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => setActiveDayId(day.id)}
                  className={cn(
                    "hit rounded-full border px-3 py-1 font-mono text-[10.5px] font-semibold transition-colors",
                    day.id === activeDayId
                      ? "border-line-sel bg-accent-soft text-accent"
                      : "border-line text-fg-dim hover:border-stroke",
                  )}
                >
                  {day.name.toUpperCase()}
                </button>
              ))}
            <span className="text-xs text-fg-dim">
              Pick one, then add an exercise from the library to turn it into a training day.
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <LibraryPanel
          library={library}
          activeDayId={activeDayId}
          activeDayName={activeDay?.name ?? null}
        />
        <LoadCheck load={load} />
      </div>
    </div>
  );
}
