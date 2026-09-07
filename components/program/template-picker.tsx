"use client";

import { useActionState, useState } from "react";
import { Info } from "lucide-react";
import { applyTemplate, type ActionState } from "@/app/actions/program";
import {
  EQUIPMENT_PROFILES,
  TEMPLATES,
  type EquipmentProfile,
} from "@/lib/program/templates";
import { DAY_NAMES } from "@/lib/dates";
import { cn } from "@/lib/utils";

const LEVEL_LABEL: Record<string, string> = {
  beginner: "New to lifting",
  intermediate: "A year or so in",
  advanced: "Experienced",
};

/**
 * Fills a week from a fixed blueprint.
 *
 * Framed as a starting point, not a prescription — the copy says plainly that
 * it is editable, because the whole premise of the app is that the week is
 * yours.
 */
export function TemplatePicker({
  weekStart,
  onDone,
}: {
  weekStart: string;
  onDone?: () => void;
}) {
  const [state, apply] = useActionState(applyTemplate, {} as ActionState);
  const [selected, setSelected] = useState(TEMPLATES[0]!.slug);
  const [equipment, setEquipment] = useState<EquipmentProfile>("full_gym");

  const template = TEMPLATES.find((t) => t.slug === selected)!;

  return (
    <form
      action={(fd) => {
        apply(fd);
        onDone?.();
      }}
      className="rounded-[18px] border border-line-hi bg-surface p-5"
    >
      <input type="hidden" name="weekStart" value={weekStart} />
      <input type="hidden" name="template" value={selected} />
      <input type="hidden" name="equipment" value={equipment} />

      <h2 className="text-sm font-bold">Start from a template</h2>
      <p className="mt-1 mb-4 max-w-[560px] text-xs leading-[1.55] text-fg-soft">
        A written-out week to start from, not a plan you have to follow. Nothing is
        generated — these are fixed splits, and you edit every day before publishing.
      </p>

      <div className="grid gap-2.5 lg:grid-cols-3">
        {TEMPLATES.map((option) => (
          <button
            key={option.slug}
            type="button"
            onClick={() => setSelected(option.slug)}
            aria-pressed={selected === option.slug}
            className={cn(
              "rounded-[14px] border p-3.5 text-left transition-colors",
              selected === option.slug
                ? "border-line-sel bg-accent-soft"
                : "border-line bg-surface-2 hover:border-stroke",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold tracking-[0.1em] text-fg-dim uppercase">
                {LEVEL_LABEL[option.level]}
              </span>
              <span className="ml-auto font-mono text-[10px] text-fg-dim">
                {option.daysPerWeek} D/WK
              </span>
            </div>
            <div className="mt-2 text-[13.5px] font-bold">{option.name}</div>
            <div className="mt-1 text-[11.5px] leading-[1.5] text-fg-soft">
              {option.summary}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4">
        <div className="eyebrow mb-2">What do you have access to?</div>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT_PROFILES.map((profile) => (
            <button
              key={profile.key}
              type="button"
              onClick={() => setEquipment(profile.key)}
              aria-pressed={equipment === profile.key}
              className={cn(
                "rounded-[11px] border px-3.5 py-2.5 text-left transition-colors",
                equipment === profile.key
                  ? "border-line-sel bg-accent-soft"
                  : "border-line bg-surface-2 hover:border-stroke",
              )}
            >
              <span className="block text-[12.5px] font-bold">{profile.name}</span>
              <span className="mt-0.5 block font-mono text-[10px] text-fg-dim">
                {profile.detail}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-[12px] border border-line bg-surface-2 p-3.5">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 size-3.5 flex-none text-fg-dim" strokeWidth={2} />
          <div>
            <p className="text-[12.5px] leading-[1.55] text-fg-muted">
              {template.bestFor}
            </p>
            {template.belowFloorByDesign ? (
              <p className="mt-2 text-[11.5px] leading-[1.5] text-warn">
                The load check will show this week under its weekly set floor. That
                is on purpose — the floor is tuned for someone a year in, and you
                grow on far less to start with.
              </p>
            ) : null}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {template.days.map((day) => (
                <span
                  key={day.dayIndex}
                  className="rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-fg-soft"
                >
                  {DAY_NAMES[day.dayIndex]?.toUpperCase()} · {day.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {state.error ? (
        <p className="mt-3 rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p className="mt-3 rounded-[10px] border border-line-hi bg-accent-soft px-3 py-2 text-xs text-accent">
          {state.notice}
        </p>
      ) : null}

      <button
        type="submit"
        className="mt-4 rounded-[10px] bg-accent px-[18px] py-[11px] text-[13px] font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi"
      >
        Fill the week with {template.name}
      </button>
      <p className="mt-2 text-[11.5px] text-fg-dim">
        This replaces every day in the week. It stays a draft until you publish.
      </p>
    </form>
  );
}
