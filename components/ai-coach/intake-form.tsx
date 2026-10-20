"use client";

import { useState } from "react";
import { designPlan } from "@/app/actions/ai-coach";
import { useAction } from "@/lib/use-action";
import { GOAL_LABELS } from "@/lib/profile";
import {
  EQUIPMENT,
  EQUIPMENT_LABEL,
  EXPERIENCE,
  EXPERIENCE_LABEL,
  GOALS,
  SESSION_LENGTHS,
  type Intake,
} from "@/lib/ai-coach/schemas";
import type { Equipment } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { RunProgress } from "./run-progress";
import { Choice, Notice, Spinner, fieldClass, primaryButton } from "./ui";

const PRESETS: { name: string; detail: string; equipment: Equipment[] }[] = [
  { name: "Full gym", detail: "Barbells, machines, cables", equipment: ["barbell", "dumbbell", "machine", "cable", "body_only", "ez_curl_bar"] },
  { name: "Dumbbells", detail: "A pair and a bench", equipment: ["dumbbell", "body_only", "bands"] },
  { name: "Bodyweight", detail: "The floor and a bar", equipment: ["body_only"] },
];

/** The questions a week is designed from. Sent only when "Design my week" is pressed. */
export function IntakeForm({
  initial,
  dayLabels,
  remaining,
  onDone,
}: {
  initial: Intake;
  dayLabels: string[];
  remaining: number;
  onDone: (notice: string) => void;
}) {
  const [intake, setIntake] = useState<Intake>(initial);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();

  const set = <K extends keyof Intake>(key: K, value: Intake[K]) => setIntake((prev) => ({ ...prev, [key]: value }));
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const problems = [
    intake.equipment.length === 0 && "Pick at least one kind of equipment.",
    intake.preferredDays.length > 0 &&
      intake.preferredDays.length !== intake.daysPerWeek &&
      `Pick ${intake.daysPerWeek} preferred days, or none.`,
  ].filter((p): p is string => Boolean(p));

  if (pending) return <RunProgress kind="plan" />;

  return (
    <div className="flex flex-col gap-5">
      <Question title="What is the goal?">
        <div className="flex flex-wrap gap-2">
          {GOALS.map((goal) => (
            <Choice key={goal} selected={intake.goal === goal} onClick={() => set("goal", goal)}>
              {GOAL_LABELS[goal]}
            </Choice>
          ))}
        </div>
      </Question>

      <Question title="How long have you been lifting?">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {EXPERIENCE.map((level) => (
            <Choice
              key={level}
              selected={intake.experience === level}
              onClick={() => set("experience", level)}
              detail={EXPERIENCE_LABEL[level].detail}
            >
              {EXPERIENCE_LABEL[level].name}
            </Choice>
          ))}
        </div>
      </Question>

      <Question title="Days a week" hint="And, if it matters, which ones.">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <Choice
              key={n}
              selected={intake.daysPerWeek === n}
              onClick={() => setIntake((prev) => ({ ...prev, daysPerWeek: n, preferredDays: [] }))}
              className="min-w-11 text-center"
            >
              {n}
            </Choice>
          ))}
        </div>
        <div className="mt-2.5 grid grid-cols-7 gap-1.5">
          {dayLabels.map((label, index) => {
            const on = intake.preferredDays.includes(index);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => set("preferredDays", toggle(intake.preferredDays, index).sort((a, b) => a - b))}
                className={cn(
                  "h-10 rounded-[10px] border font-mono text-[10.5px] font-bold tracking-[0.06em] uppercase transition-colors",
                  on ? "border-line-sel bg-accent-soft text-accent" : "border-line bg-surface-2 text-fg-dim hover:border-stroke",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Question>

      <Question title="Time per session">
        <div className="flex flex-wrap gap-2">
          {SESSION_LENGTHS.map((minutes) => (
            <Choice key={minutes} selected={intake.sessionMinutes === minutes} onClick={() => set("sessionMinutes", minutes)}>
              {minutes} min
            </Choice>
          ))}
        </div>
      </Question>

      <Question title="Equipment you can use">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {PRESETS.map((preset) => (
            <Choice
              key={preset.name}
              selected={sameSet(intake.equipment, preset.equipment)}
              onClick={() => set("equipment", preset.equipment)}
              detail={preset.detail}
            >
              {preset.name}
            </Choice>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {EQUIPMENT.map((kind) => {
            const on = intake.equipment.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={on}
                onClick={() => set("equipment", toggle(intake.equipment, kind))}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-[11.5px] font-semibold transition-colors",
                  on ? "border-line-sel bg-accent-soft text-accent" : "border-line bg-surface-2 text-fg-dim hover:border-stroke",
                )}
              >
                {EQUIPMENT_LABEL[kind]}
              </button>
            );
          })}
        </div>
      </Question>

      <Question title="Injuries or limitations" hint="The coach avoids loading them and won't diagnose anything.">
        <textarea
          value={intake.limitations}
          onChange={(e) => set("limitations", e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="e.g. left shoulder clicks on overhead pressing"
          className={fieldClass}
        />
      </Question>

      <div className="grid gap-5 sm:grid-cols-2">
        <Question title="Exercises you like">
          <textarea
            value={intake.likes}
            onChange={(e) => set("likes", e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="e.g. deadlifts, pull-ups"
            className={fieldClass}
          />
        </Question>
        <Question title="Exercises you'd rather skip">
          <textarea
            value={intake.dislikes}
            onChange={(e) => set("dislikes", e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="e.g. lunges"
            className={fieldClass}
          />
        </Question>
      </div>

      <label className="flex items-start gap-3 rounded-[12px] border border-line bg-surface-2 p-3.5">
        <input
          type="checkbox"
          checked={intake.shareBodyDetails}
          onChange={(e) => set("shareBodyDetails", e.target.checked)}
          className="mt-0.5 size-4 flex-none accent-[#c9f24d]"
        />
        <span className="text-[12.5px] leading-[1.5] text-fg-muted">
          Let the coach use my sex, age and height from my profile.
          <span className="mt-0.5 block text-[11.5px] text-fg-dim">Off by default. Helps pitch volume and exercise choice.</span>
        </span>
      </label>

      {problems.length ? <Notice error={problems[0]} /> : null}
      <Notice error={error} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={pending || problems.length > 0 || remaining <= 0}
          aria-busy={pending || undefined}
          onClick={() =>
            run(async () => {
              setError(null);
              const result = await designPlan(intake);
              if (result.error) setError(result.error);
              else if (result.notice) onDone(result.notice);
            })
          }
          className={primaryButton}
        >
          <Spinner show={pending} />
          Design my week
        </button>
        <p className="text-[11.5px] text-fg-dim">
          {remaining > 0
            ? `Sends your answers and library to Anthropic. Uses 1 of your ${remaining} remaining runs.`
            : "You've used today's runs. They free up 24 hours after each one started."}
        </p>
      </div>
    </div>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2">
        <h3 className="text-[13px] font-bold text-fg-2">{title}</h3>
        {hint ? <p className="mt-0.5 text-[11.5px] text-fg-dim">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}
