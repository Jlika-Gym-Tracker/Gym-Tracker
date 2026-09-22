"use client";

import { useActionState, useState } from "react";
import { completeOnboarding, skipOnboarding, type ActionState } from "@/app/actions/onboarding";
import { ACTIVITY_LEVELS, calculateTargets } from "@/lib/nutrition/targets";
import { COMMON_ALLERGENS, COMMON_PREFERENCES } from "@/lib/nutrition/excludes";
import { GOAL_LABELS } from "@/lib/profile";
import { displayToCm, displayToKg, lengthUnit, weightUnit } from "@/lib/units";
import { DAY_NAMES } from "@/lib/dates";
import type { Goal, Sex, UnitSystem } from "@/lib/database.types";
import { PLACEHOLDER_IMAGES } from "@/lib/placeholder-images";
import { Logo } from "@/components/shell/logo";
import { Message, Segmented } from "@/components/profile/controls";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/kit/action-button";

const STEPS = ["Account", "Body", "Goal", "Food", "Program"] as const;

const SIDE_COPY = [
  {
    tag: "Private by default",
    title: "One account each. Nothing shared unless you say so.",
    body: "Friends you invite get their own login, their own photos and their own numbers.",
  },
  {
    tag: "Just the math",
    title: "We only need this once — your scale takes over.",
    body: "Maintenance calories are an estimate; weekly weigh-ins correct it automatically.",
  },
  {
    tag: "Fat loss, muscle kept",
    title: "Every week you write the plan. JLIKA Gym remembers the rest.",
    body: "Sets, loads, photos and macros stitched into one timeline you keep private.",
  },
  {
    tag: "Hard filters",
    title: "No allergen ever slips into a recipe or a grocery list.",
    body: "Excludes apply to plans, swaps and search, and you can change them any time.",
  },
  {
    tag: "Your week, your rules",
    title: "Paste it, build it, or start blank.",
    body: "Whatever you paste becomes structured sets and reps, matched to the library.",
  },
];

export function OnboardingFlow({ defaultName }: { defaultName: string }) {
  const [state, submit] = useActionState(completeOnboarding, {} as ActionState);
  const [step, setStep] = useState(0);

  const [displayName, setDisplayName] = useState(defaultName);
  const [sex, setSex] = useState<Sex>("male");
  const [birthYear, setBirthYear] = useState(1996);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("metric");
  const [height, setHeight] = useState(178);
  const [weight, setWeight] = useState(77);
  const [goal, setGoal] = useState<Goal>("cut");
  const [activityFactor, setActivityFactor] = useState(1.45);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [mealsPerDay, setMealsPerDay] = useState(4);
  const [trainingDays, setTrainingDays] = useState<number[]>([0, 1, 3, 4]);

  const side = SIDE_COPY[step]!;
  const isLast = step === STEPS.length - 1;

  // Shown live on the goal step so the numbers are not a surprise later.
  const preview = calculateTargets({
    weightKg: displayToKg(weight, unitSystem),
    heightCm: displayToCm(height, unitSystem),
    age: new Date().getFullYear() - birthYear,
    sex,
    activityFactor,
    goal,
  });

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  return (
    <main className="flex min-h-svh items-stretch gap-[18px] bg-bg p-[30px]">
      <form
        action={submit}
        className="flex flex-1 flex-col rounded-[20px] border border-line bg-surface px-6 py-[34px] sm:px-[38px]"
      >
        {/* Every step's values post together at the end, so going back never loses them. */}
        <input type="hidden" name="displayName" value={displayName} />
        <input type="hidden" name="sex" value={sex} />
        <input type="hidden" name="birthYear" value={birthYear} />
        <input type="hidden" name="unitSystem" value={unitSystem} />
        <input type="hidden" name="height" value={height} />
        <input type="hidden" name="weight" value={weight} />
        <input type="hidden" name="goal" value={goal} />
        <input type="hidden" name="activityFactor" value={activityFactor} />
        <input type="hidden" name="mealsPerDay" value={mealsPerDay} />
        {allergens.map((a) => <input key={a} type="hidden" name="allergens" value={a} />)}
        {preferences.map((p) => <input key={p} type="hidden" name="preferences" value={p} />)}
        {trainingDays.map((d) => <input key={d} type="hidden" name="trainingDays" value={d} />)}

        <div className="mb-[26px] flex items-center gap-4">
          <Logo size={26} />
          <div className="ml-auto flex flex-1 gap-1.5">
            {STEPS.map((name, index) => (
              <div key={name} className="flex-1">
                <div
                  className={cn(
                    "h-1 rounded-sm",
                    index <= step ? "bg-accent" : "bg-line",
                  )}
                />
                <div
                  className={cn(
                    "mt-2 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase",
                    index <= step ? "text-accent" : "text-fg-dim",
                  )}
                >
                  {name}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
          Step {step + 1} of {STEPS.length}
        </div>

        {step === 0 ? (
          <StepBody
            title="What should we call you?"
            body="One account per person. Invite friends later — each gets their own private space, and nobody sees anyone else's photos or numbers."
          >
            <label className="block max-w-[420px]">
              <span className="eyebrow mb-1.5 block">Display name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-[11px] border border-line bg-surface-2 px-3.5 py-3.5 text-[13.5px] outline-none focus:border-line-hi"
              />
            </label>
          </StepBody>
        ) : null}

        {step === 1 ? (
          <StepBody
            title="Tell us about your body."
            body="Used once to estimate your maintenance calories (Mifflin-St Jeor). Your weekly weigh-ins take over from there."
          >
            <div className="grid max-w-[620px] gap-3.5 sm:grid-cols-3">
              <div>
                <span className="eyebrow mb-1.5 block">Sex</span>
                <Segmented
                  label="Sex"
                  value={sex}
                  onChange={setSex}
                  options={[
                    { value: "male" as Sex, label: "Male" },
                    { value: "female" as Sex, label: "Female" },
                  ]}
                />
              </div>
              <NumberField label="Birth year" value={birthYear} onChange={setBirthYear} />
              <NumberField
                label={`Height (${lengthUnit(unitSystem)})`}
                value={height}
                onChange={setHeight}
              />
            </div>

            <div className="mt-5 max-w-[300px]">
              <span className="eyebrow mb-1.5 block">Units</span>
              <Segmented
                label="Units"
                value={unitSystem}
                onChange={setUnitSystem}
                options={[
                  { value: "metric" as UnitSystem, label: "kg / cm" },
                  { value: "imperial" as UnitSystem, label: "lb / in" },
                ]}
              />
            </div>

            <div className="mt-6">
              <span className="eyebrow mb-2.5 block">Current weight</span>
              <div className="flex items-baseline gap-2">
                <input
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value) || 0)}
                  inputMode="decimal"
                  aria-label="Current weight"
                  // Bigger than 16px on purpose; see the touch rule in globals.css.
                  data-display
                  className="w-[160px] bg-transparent font-mono text-[56px] leading-none font-extrabold tracking-[-0.05em] outline-none"
                />
                <span className="text-base font-semibold text-fg-soft">
                  {weightUnit(unitSystem)}
                </span>
              </div>
            </div>

            <div className="mt-6 max-w-[620px]">
              <span className="eyebrow mb-2.5 block">Activity outside the gym</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ACTIVITY_LEVELS.map((level) => (
                  <button
                    key={level.factor}
                    type="button"
                    onClick={() => setActivityFactor(level.factor)}
                    className={cn(
                      "rounded-xl border px-3.5 py-3 text-left transition-colors",
                      activityFactor === level.factor
                        ? "border-line-sel bg-accent-soft"
                        : "border-line bg-surface-2 hover:border-stroke",
                    )}
                  >
                    <span className="block text-[13px] font-bold">{level.name}</span>
                    <span className="mt-1 block font-mono text-[10px] text-fg-dim">
                      {level.factor} ×
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </StepBody>
        ) : null}

        {step === 2 ? (
          <StepBody
            title="What are you working toward?"
            body="This sets your calorie target, protein floor and how we read your weekly weigh-ins. You can change it any time without losing history."
          >
            <div className="grid max-w-[620px] gap-2.5 sm:grid-cols-2">
              {(Object.keys(GOAL_LABELS) as Goal[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGoal(key)}
                  className={cn(
                    "rounded-[14px] border px-4 py-4 text-left transition-colors",
                    goal === key
                      ? "border-line-sel bg-accent-soft"
                      : "border-line bg-surface-2 hover:border-stroke",
                  )}
                >
                  <span className="block text-sm font-bold">{GOAL_LABELS[key]}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex max-w-[620px] flex-wrap items-center gap-6 rounded-[14px] border border-line-hi bg-accent-soft px-4 py-4">
              <div className="min-w-[240px] flex-1">
                <div className="font-mono text-[10px] font-bold tracking-[0.12em] text-accent uppercase">
                  Your targets
                </div>
                <p className="mt-1.5 text-[12.5px] leading-[1.5] text-[#dfe7d5]">
                  Maintenance ≈ {preview.maintenance.toLocaleString()} kcal. These are
                  estimates — your weigh-ins correct them.
                </p>
              </div>
              <div className="flex gap-5">
                <Preview value={preview.calories.toLocaleString()} label="kcal" />
                <Preview value={String(preview.proteinG)} label="g protein" />
                <Preview value={String(trainingDays.length)} label="days / wk" />
              </div>
            </div>
          </StepBody>
        ) : null}

        {step === 3 ? (
          <StepBody
            title="Anything you can't or won't eat?"
            body="Allergies are hard filters — recipes containing them never show up in your plan, swaps or grocery list. Preferences only nudge."
          >
            <span className="eyebrow mb-2.5 block">Allergies</span>
            <div className="flex max-w-[620px] flex-wrap gap-2">
              {COMMON_ALLERGENS.map((name) => (
                <Chip
                  key={name}
                  on={allergens.includes(name)}
                  onClick={() => toggle(allergens, setAllergens, name)}
                >
                  {name}
                </Chip>
              ))}
            </div>

            <span className="eyebrow mt-6 mb-2.5 block">Preferences</span>
            <div className="flex max-w-[620px] flex-wrap gap-2">
              {COMMON_PREFERENCES.map((name) => (
                <Chip
                  key={name}
                  on={preferences.includes(name)}
                  onClick={() => toggle(preferences, setPreferences, name)}
                >
                  {name}
                </Chip>
              ))}
            </div>

            <span className="eyebrow mt-6 mb-2.5 block">Meals per day</span>
            <div className="max-w-[300px]">
              <Segmented
                label="Meals per day"
                value={mealsPerDay}
                onChange={setMealsPerDay}
                options={[3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
              />
            </div>
          </StepBody>
        ) : null}

        {step === 4 ? (
          <StepBody
            title="Which days do you train?"
            body="You write the program — every week. Next you'll paste it as text, build it by hand, or start blank and fill it in at the gym."
          >
            <div className="flex flex-wrap gap-2">
              {DAY_NAMES.map((name, index) => {
                const on = trainingDays.includes(index);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() =>
                      setTrainingDays((current) =>
                        on ? current.filter((d) => d !== index) : [...current, index],
                      )
                    }
                    aria-pressed={on}
                    className={cn(
                      "rounded-xl border px-4 py-3 font-mono text-[11px] font-bold transition-colors",
                      on
                        ? "border-line-sel bg-accent-soft text-accent"
                        : "border-line bg-surface-2 text-fg-dim hover:border-stroke",
                    )}
                  >
                    {name.toUpperCase()}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 max-w-[620px] rounded-xl border border-line-hi bg-[#0a0c0d] px-4 py-3.5 font-mono text-xs leading-[1.75] whitespace-pre-wrap text-fg-muted">
              {`DAY 1 — UPPER A
1 Incline Dumbbell Press 3 x 8-12
2 Wide Grip Lat Pulldown 3 x 8-12
DAY 2 — LOWER A
1 Leg Press 3 x 8-12
…`}
              <span className="text-accent">▍</span>
            </div>
            <p className="mt-2.5 max-w-[620px] text-[12.5px] text-fg-soft">
              That is the paste format. The builder opens next.
            </p>
          </StepBody>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-3 pt-7">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="rounded-[11px] border border-stroke bg-ghost px-5 py-[13px] text-[13.5px] font-semibold text-fg-muted hover:bg-hover"
            >
              Back
            </button>
          ) : null}

          {isLast ? (
            <ActionButton
            pendingLabel="Saving…"
              disabled={trainingDays.length === 0}
              className="rounded-[11px] bg-accent px-[26px] py-[13px] text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi disabled:opacity-50"
            >
              Finish and write week 1
            </ActionButton>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="rounded-[11px] bg-accent px-[26px] py-[13px] text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
            >
              Continue
            </button>
          )}

          <button
            type="button"
            onClick={() => void skipOnboarding()}
            className="text-xs text-fg-dim hover:text-fg-soft"
          >
            Skip for now
          </button>
        </div>

        <div className="mt-3">
          <Message error={state.error} notice={state.notice} />
        </div>
      </form>

      <aside
        className="relative hidden w-[392px] flex-none overflow-hidden rounded-[20px] border border-line bg-surface bg-cover bg-center lg:block"
        style={{ backgroundImage: `url(${PLACEHOLDER_IMAGES.onboardingPanel})` }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#08090a10_30%,#08090af8_100%)]" />
        <div className="absolute inset-x-0 bottom-0 p-7">
          <div className="font-mono text-[10px] font-bold tracking-[0.12em] text-accent uppercase">
            {side.tag}
          </div>
          <div className="mt-2.5 text-[22px] leading-[1.2] font-extrabold tracking-[-0.03em]">
            {side.title}
          </div>
          <p className="mt-2.5 text-[12.5px] leading-[1.5] text-fg-muted">{side.body}</p>
        </div>
      </aside>
    </main>
  );
}

function StepBody({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <h1 className="display max-w-[520px] text-[34px]">{title}</h1>
      <p className="mt-2 mb-6 max-w-[480px] text-[13.5px] leading-[1.55] text-fg-soft">
        {body}
      </p>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block">{label}</span>
      <input
        value={value}
        inputMode="numeric"
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-[11px] border border-line bg-surface-2 px-3.5 py-3 text-[13.5px] outline-none focus:border-line-hi"
      />
    </label>
  );
}

function Preview({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[22px] font-extrabold tracking-[-0.03em]">{value}</div>
      <div className="mt-0.5 font-mono text-[10px] text-accent-2 uppercase">{label}</div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-full border px-4 py-2.5 text-[13px] font-semibold transition-colors",
        on
          ? "border-line-sel bg-accent-soft text-accent"
          : "border-line bg-surface-2 text-fg-soft hover:border-stroke",
      )}
    >
      {children}
    </button>
  );
}
