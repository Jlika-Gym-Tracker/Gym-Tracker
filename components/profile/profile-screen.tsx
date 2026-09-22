"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  createInvite,
  deleteAccount,
  redeemInvite,
  removeCrewLink,
  saveAccount,
  saveTargets,
  setRestSeconds,
  toggleSetting,
  toggleSharing,
  type ActionState,
} from "@/app/actions/profile";
import { toggleExclude } from "@/app/actions/nutrition";
import { COMMON_ALLERGENS, COMMON_PREFERENCES } from "@/lib/nutrition/excludes";
import type { Targets } from "@/lib/nutrition/targets";
import { ACTIVITY_LEVELS } from "@/lib/nutrition/targets";
import type {
  CrewInvite, CrewMember, Profile, SharingPrefs, UnitSystem, UserSettings,
} from "@/lib/database.types";
import { cmToDisplay, lengthUnit, trimNumber } from "@/lib/units";
import { DAY_NAMES } from "@/lib/dates";
import { GOAL_LABELS } from "@/lib/profile";
import { Card } from "@/components/kit/card";
import { AvatarBubble } from "@/components/shell/avatar-bubble";
import { cn } from "@/lib/utils";
import { MyCoaches } from "@/components/coach/my-coaches";
import type { MyCoach } from "@/lib/coach/queries";
import { Field, Message, Segmented, Slider, Toggle } from "./controls";

const TABS = ["Account", "Targets", "Food", "Coach", "Crew", "Data & privacy"] as const;
type Tab = (typeof TABS)[number];

export function ProfileScreen({
  profile,
  settings,
  sharing,
  excludes,
  crew,
  invites,
  targets,
  email,
  stats,
  coaches,
}: {
  profile: Profile;
  settings: UserSettings;
  sharing: SharingPrefs;
  excludes: { kind: string; value: string }[];
  crew: CrewMember[];
  invites: CrewInvite[];
  targets: Targets | null;
  email: string;
  stats: { sessions: number; weeks: number; photos: number };
  coaches: MyCoach[];
}) {
  const [tab, setTab] = useState<Tab>("Account");
  const system = profile.unit_system;

  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="flex flex-wrap items-center gap-4">
        <div className="rounded-full border-2 border-accent p-1">
          <AvatarBubble name={profile.display_name} src={profile.avatar_url} size={68} />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-[-0.03em]">
            {profile.display_name}
          </h1>
          <p className="mt-1 font-mono text-[11px] text-fg-dim uppercase">
            {email} · {GOAL_LABELS[profile.goal]}
          </p>
        </div>
        <div className="flex w-full justify-between gap-6 sm:ml-auto sm:w-auto sm:justify-start">
          {[
            ["Sessions", stats.sessions],
            ["Weeks written", stats.weeks],
            ["Photos", stats.photos],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <div className="eyebrow">{label}</div>
              <div className="mt-1 font-mono text-xl font-extrabold">{value}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap gap-1.5 pointer-coarse:gap-y-3">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            aria-current={tab === name ? "page" : undefined}
            className={cn(
              "hit rounded-full px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.08em] uppercase transition-colors",
              tab === name ? "bg-accent text-[#0a0c0d]" : "text-fg-soft hover:text-fg",
            )}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "Account" ? <AccountTab profile={profile} system={system} /> : null}
      {tab === "Targets" ? (
        <TargetsTab profile={profile} settings={settings} targets={targets} />
      ) : null}
      {tab === "Food" ? <FoodTab excludes={excludes} settings={settings} /> : null}
      {tab === "Coach" ? (
        <MyCoaches
          coaches={coaches}
          meId={profile.id}
          coachingEnabled={profile.coaching_enabled}
          needsBodySetup={profile.height_cm === null}
        />
      ) : null}
      {tab === "Crew" ? (
        <CrewTab crew={crew} invites={invites} sharing={sharing} meId={profile.id} />
      ) : null}
      {tab === "Data & privacy" ? <DataTab settings={settings} /> : null}
    </div>
  );
}

function AccountTab({ profile, system }: { profile: Profile; system: UnitSystem }) {
  const [state, save] = useActionState(saveAccount, {} as ActionState);
  const [unit, setUnit] = useState<UnitSystem>(system);
  const [goal, setGoal] = useState(profile.goal);
  const [activity, setActivity] = useState(Number(profile.activity_factor));

  return (
    <Card>
      <form action={save} className="flex max-w-[720px] flex-col gap-4">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Display name" name="displayName" defaultValue={profile.display_name} required />
          <Field
            label="Birth date"
            name="birthDate"
            type="date"
            defaultValue={profile.birth_date ?? ""}
            hint="Used once, for the calorie formula."
          />
          <Field
            label={`Height (${lengthUnit(unit)})`}
            name="height"
            inputMode="decimal"
            defaultValue={
              profile.height_cm ? trimNumber(cmToDisplay(Number(profile.height_cm), unit)) : ""
            }
          />
          <div>
            <span className="eyebrow mb-1.5 block">Sex</span>
            <select
              name="sex"
              defaultValue={profile.sex ?? ""}
              className="w-full rounded-[11px] border border-line bg-surface-2 px-3.5 py-3 text-[13.5px] text-fg-2 outline-none focus:border-line-hi"
            >
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div>
          <span className="eyebrow mb-2 block">Units</span>
          <input type="hidden" name="unitSystem" value={unit} />
          <Segmented
            label="Units"
            value={unit}
            onChange={setUnit}
            options={[
              { value: "metric" as const, label: "kg / cm" },
              { value: "imperial" as const, label: "lb / in" },
            ]}
          />
        </div>

        <div>
          <span className="eyebrow mb-2 block">Goal</span>
          <input type="hidden" name="goal" value={goal} />
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(Object.keys(GOAL_LABELS) as (keyof typeof GOAL_LABELS)[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setGoal(key)}
                className={cn(
                  "rounded-[14px] border px-4 py-3.5 text-left transition-colors",
                  goal === key
                    ? "border-line-sel bg-accent-soft"
                    : "border-line bg-surface-2 hover:border-stroke",
                )}
              >
                <span className="block text-sm font-bold">{GOAL_LABELS[key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="eyebrow mb-2 block">Activity outside the gym</span>
          <input type="hidden" name="activityFactor" value={activity} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ACTIVITY_LEVELS.map((level) => (
              <button
                key={level.factor}
                type="button"
                onClick={() => setActivity(level.factor)}
                className={cn(
                  "rounded-xl border px-3.5 py-3 text-left transition-colors",
                  activity === level.factor
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

        <Message error={state.error} notice={state.notice} />
        <button
          type="submit"
          className="w-fit rounded-[11px] bg-accent px-[22px] py-3 text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
        >
          Save account
        </button>
      </form>
    </Card>
  );
}

function TargetsTab({
  profile,
  settings,
  targets,
}: {
  profile: Profile;
  settings: UserSettings;
  targets: Targets | null;
}) {
  const [state, save] = useActionState(saveTargets, {} as ActionState);
  const [deficit, setDeficit] = useState(settings.deficit_kcal);
  const [protein, setProtein] = useState(Number(settings.protein_g_per_kg));
  const [fat, setFat] = useState(Math.round(Number(settings.fat_pct) * 100));
  const [bonus, setBonus] = useState(profile.training_day_kcal_bonus);
  const [meals, setMeals] = useState(settings.meals_per_day);
  const [days, setDays] = useState<number[]>(settings.training_days ?? []);

  return (
    <Card>
      <form action={save} className="flex max-w-[720px] flex-col gap-3">
        {targets ? (
          <div className="mb-2 flex flex-wrap items-center gap-6 rounded-[14px] border border-line-hi bg-accent-soft px-4 py-3.5">
            <div>
              <div className="font-mono text-[10px] font-bold tracking-[0.12em] text-accent uppercase">
                Maintenance
              </div>
              <div className="mt-1 text-xl font-extrabold">
                {targets.maintenance.toLocaleString()}
              </div>
            </div>
            {[
              ["Kcal", targets.calories.toLocaleString()],
              ["Protein", `${targets.proteinG} g`],
              ["Carbs", `${targets.carbG} g`],
              ["Fat", `${targets.fatG} g`],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="font-mono text-[10px] text-accent-2 uppercase">{label}</div>
                <div className="mt-1 text-xl font-extrabold">{value}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-2 rounded-[11px] border border-line bg-surface-2 px-3.5 py-3 text-[12.5px] text-fg-soft">
            Fill in height, birth date and sex on the Account tab, and log a weigh-in,
            and the resulting targets appear here.
          </p>
        )}

        <Slider
          name="deficitKcal" label="Deficit" value={deficit} min={0} max={1000} step={25}
          suffix="kcal / day" onChange={setDeficit}
          hint="Roughly 0.4–0.6 kg a week comes from a 400–600 kcal deficit. Targets never go below your BMR."
        />
        <Slider
          name="proteinGPerKg" label="Protein floor" value={protein} min={1.4} max={3.2} step={0.1}
          suffix="g / kg" onChange={setProtein}
          hint="2.2–2.4 g per kg protects muscle while cutting."
        />
        <Slider
          name="fatPct" label="Fat" value={fat} min={15} max={45} step={1}
          suffix="% of calories" onChange={setFat}
          hint="Carbohydrate takes whatever is left after protein and fat."
        />
        <Slider
          name="trainingDayBonus" label="Training-day bonus" value={bonus} min={0} max={600} step={25}
          suffix="kcal" onChange={setBonus} hint="Added as carbohydrate on days you train."
        />

        <div className="py-2.5">
          <span className="eyebrow mb-2 block">Training days</span>
          <div className="flex flex-wrap gap-2">
            {DAY_NAMES.map((name, index) => {
              const on = days.includes(index);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() =>
                    setDays((current) =>
                      on ? current.filter((d) => d !== index) : [...current, index],
                    )
                  }
                  aria-pressed={on}
                  className={cn(
                    "rounded-xl border px-3.5 py-2.5 font-mono text-[11px] font-bold transition-colors",
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
          {days.map((d) => (
            <input key={d} type="hidden" name="trainingDays" value={d} />
          ))}
        </div>

        <div className="py-2.5">
          <span className="eyebrow mb-2 block">Meals per day</span>
          <input type="hidden" name="mealsPerDay" value={meals} />
          <div className="max-w-[300px]">
            <Segmented
              label="Meals per day"
              value={meals}
              onChange={setMeals}
              options={[3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
            />
          </div>
        </div>

        <input type="hidden" name="refeedDay" value={settings.refeed_day ?? ""} />
        <input type="hidden" name="autoAdjust" value={settings.auto_adjust ? "on" : ""} />
        <input
          type="hidden"
          name="askBeforeAdjust"
          value={settings.ask_before_adjust ? "on" : ""}
        />

        <Message error={state.error} notice={state.notice} />
        <button
          type="submit"
          className="w-fit rounded-[11px] bg-accent px-[22px] py-3 text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
        >
          Save targets
        </button>
      </form>
    </Card>
  );
}

function FoodTab({
  excludes,
  settings,
}: {
  excludes: { kind: string; value: string }[];
  settings: UserSettings;
}) {
  const [, startTransition] = useTransition();
  const [local, setLocal] = useState(excludes);

  const has = (kind: string, value: string) =>
    local.some((e) => e.kind === kind && e.value === value);

  function toggle(kind: "allergen" | "preference", value: string) {
    const on = !has(kind, value);
    setLocal((current) =>
      on
        ? [...current, { kind, value }]
        : current.filter((e) => !(e.kind === kind && e.value === value)),
    );
    startTransition(() => void toggleExclude(kind, value, on));
  }

  return (
    <Card className="max-w-[720px]">
      <h2 className="text-[15px] font-bold">Allergies</h2>
      <p className="mt-1 mb-3 text-[12.5px] leading-[1.5] text-fg-soft">
        Hard filters. A recipe containing one of these never appears in your plan,
        a swap or a search.
      </p>
      <div className="flex flex-wrap gap-2">
        {COMMON_ALLERGENS.map((name) => (
          <Chip key={name} on={has("allergen", name)} onClick={() => toggle("allergen", name)}>
            {name}
          </Chip>
        ))}
      </div>

      <h2 className="mt-6 text-[15px] font-bold">Preferences</h2>
      <p className="mt-1 mb-3 text-[12.5px] leading-[1.5] text-fg-soft">
        Soft signals. These shape what gets suggested but never hide food from you.
      </p>
      <div className="flex flex-wrap gap-2">
        {COMMON_PREFERENCES.map((name) => (
          <Chip key={name} on={has("preference", name)} onClick={() => toggle("preference", name)}>
            {name}
          </Chip>
        ))}
      </div>

      <p className="mt-6 font-mono text-[10.5px] text-fg-dim uppercase">
        Meals per day: {settings.meals_per_day} · change it on the Targets tab
      </p>
    </Card>
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

function CrewTab({
  crew,
  invites,
  sharing,
  meId,
}: {
  crew: CrewMember[];
  invites: CrewInvite[];
  sharing: SharingPrefs;
  meId: string;
}) {
  const [redeemState, redeem] = useActionState(redeemInvite, {} as ActionState);
  const [removeState, remove] = useActionState(removeCrewLink, {} as ActionState);
  const [inviteState, setInviteState] = useState<ActionState & { code?: string }>({});
  const [, startTransition] = useTransition();

  return (
    <div className="grid gap-[18px] lg:grid-cols-[1fr_320px]">
      <Card>
        <h2 className="text-[15px] font-bold">Your crew</h2>
        <p className="mt-1 mb-4 text-[12.5px] leading-[1.5] text-fg-soft">
          Friends see your name, which days you trained, your streak and your program
          name — and only what you allow below. Never weights, measurements, photos
          or sets.
        </p>

        <div className="flex flex-col">
          {crew.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-fg-dim">
              Nobody yet. Share an invite code and your crew shows up here.
            </p>
          ) : (
            crew.map((member) => (
              <div
                key={member.friend_id}
                className="flex items-center gap-3 border-b border-[#171b1d] py-3 last:border-0"
              >
                <AvatarBubble name={member.display_name} src={member.avatar_url} size={36} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold">
                    {member.display_name}
                    {member.friend_id === meId ? (
                      <span className="ml-1.5 text-fg-dim">(you)</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-fg-dim uppercase">
                    {member.program_name ?? "Program not shared"}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <div className="flex gap-1">
                    {DAY_NAMES.map((_, index) => (
                      <span
                        key={index}
                        title={DAY_NAMES[index]}
                        className={cn(
                          "size-2 rounded-[2px]",
                          member.sessions_this_week?.includes(index)
                            ? "bg-accent"
                            : "bg-line",
                        )}
                      />
                    ))}
                  </div>
                  <span className="w-10 text-right font-mono text-[11px] font-semibold text-accent">
                    {member.streak > 0 ? `${member.streak} d` : "—"}
                  </span>
                  {member.friend_id !== meId ? (
                    <form action={remove}>
                      <input type="hidden" name="friendId" value={member.friend_id} />
                      <button
                        type="submit"
                        className="font-mono text-[10px] text-fg-dim uppercase hover:text-danger"
                      >
                        Remove
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-3">
          <Message error={removeState.error} notice={removeState.notice} />
        </div>
      </Card>

      <div className="flex flex-col gap-[18px]">
        <Card>
          <h2 className="text-[15px] font-bold">Invite a friend</h2>
          <p className="mt-1 mb-3 text-[12.5px] leading-[1.5] text-fg-soft">
            Each code works three times and lasts two weeks.
          </p>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => setInviteState(await createInvite()))
            }
            className="w-full rounded-[11px] bg-accent px-4 py-3 text-[13px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
          >
            Create an invite code
          </button>
          <div className="mt-3">
            <Message error={inviteState.error} notice={inviteState.notice} />
          </div>

          {invites.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {invites.map((invite) => (
                <div
                  key={invite.code}
                  className="flex items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5"
                >
                  <span className="font-mono text-[13px] font-bold text-accent">
                    {invite.code}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-fg-dim">
                    {invite.uses_left} LEFT · {format(parseISO(invite.expires_at), "MMM dd")}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-[15px] font-bold">Join a crew</h2>
          <form action={redeem} className="mt-3 flex flex-col gap-2.5">
            <Field label="Invite code" name="code" placeholder="CREW-7K2P" required />
            <Message error={redeemState.error} notice={redeemState.notice} />
            <button
              type="submit"
              className="rounded-[11px] border border-stroke bg-ghost px-4 py-3 text-[13px] font-semibold text-fg-2 hover:bg-hover"
            >
              Join
            </button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-1 text-[15px] font-bold">What your crew sees</h2>
          <Toggle
            label="Sessions this week"
            description="Which days you trained — not what you lifted."
            checked={sharing.share_sessions}
            onChange={(v) => toggleSharing("share_sessions", v)}
          />
          <Toggle
            label="Streak"
            description="Days trained in the last month."
            checked={sharing.share_streak}
            onChange={(v) => toggleSharing("share_streak", v)}
          />
          <Toggle
            label="Program name"
            description="The label on your published week."
            checked={sharing.share_program_name}
            onChange={(v) => toggleSharing("share_program_name", v)}
          />
        </Card>
      </div>
    </div>
  );
}

function DataTab({ settings }: { settings: UserSettings }) {
  const [deleteState, remove] = useActionState(deleteAccount, {} as ActionState);
  const [rest, setRest] = useState(settings.default_rest_seconds);

  return (
    <div className="grid gap-[18px] lg:grid-cols-2">
      <Card>
        <h2 className="mb-1 text-[15px] font-bold">Session</h2>
        <Slider
          name="restSeconds" label="Default rest" value={rest} min={30} max={300} step={15}
          suffix="seconds"
          onChange={(next) => {
            setRest(next);
            void setRestSeconds(next);
          }}
        />
        <Toggle
          label="Start the rest timer automatically"
          description="Begins counting the moment you tick a set off."
          checked={settings.auto_rest}
          onChange={(v) => toggleSetting("auto_rest", v)}
        />
        <Toggle
          label="Keyboard shortcuts"
          description="Space completes a set, R restarts the rest timer."
          checked={settings.keyboard_shortcuts}
          onChange={(v) => toggleSetting("keyboard_shortcuts", v)}
        />
        <Toggle
          label="Show estimated 1RM"
          description="Adds an Epley estimate beside your best set."
          checked={settings.show_e1rm}
          onChange={(v) => toggleSetting("show_e1rm", v)}
        />
      </Card>

      <Card>
        <h2 className="mb-1 text-[15px] font-bold">Photos &amp; notifications</h2>
        <Toggle
          label="Blur photo thumbnails"
          description="Thumbnails stay blurred until you hover or tap."
          checked={settings.blur_thumbnails}
          onChange={(v) => toggleSetting("blur_thumbnails", v)}
        />
        <Toggle
          label="Strip photo metadata"
          description="Already applied on upload; turning this off does not restore metadata on existing photos."
          checked={settings.strip_exif}
          onChange={(v) => toggleSetting("strip_exif", v)}
        />
        <Toggle
          label="Weigh-in reminder"
          checked={settings.notify_weighin}
          onChange={(v) => toggleSetting("notify_weighin", v)}
        />
        <Toggle
          label="Nudge when next week is unwritten"
          checked={settings.notify_unpublished_week}
          onChange={(v) => toggleSetting("notify_unpublished_week", v)}
        />
      </Card>

      <Card>
        <h2 className="text-[15px] font-bold">Export your data</h2>
        <p className="mt-1 mb-3.5 text-[12.5px] leading-[1.5] text-fg-soft">
          Everything this account owns. The ZIP adds your progress photos.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/api/export?format=json"
            prefetch={false}
            className="rounded-[11px] border border-stroke bg-ghost px-4 py-3 text-[13px] font-semibold text-fg-2 hover:bg-hover"
          >
            Download JSON
          </Link>
          <Link
            href="/api/export?format=zip"
            prefetch={false}
            className="rounded-[11px] border border-stroke bg-ghost px-4 py-3 text-[13px] font-semibold text-fg-2 hover:bg-hover"
          >
            Download ZIP with photos
          </Link>
        </div>
      </Card>

      <Card className="border-danger-border">
        <h2 className="text-[15px] font-bold text-danger">Danger zone</h2>
        <p className="mt-1 mb-3.5 text-[12.5px] leading-[1.5] text-fg-soft">
          Deleting your account removes every session, photo, measurement and meal
          plan. It cannot be undone. Export first if you want a copy.
        </p>
        <form action={remove} className="flex flex-col gap-2.5">
          <Field
            label="Type DELETE to confirm"
            name="confirm"
            placeholder="DELETE"
            autoComplete="off"
          />
          <Message error={deleteState.error} notice={deleteState.notice} />
          <button
            type="submit"
            className="w-fit rounded-[11px] border border-danger-border bg-danger-soft px-4 py-3 text-[13px] font-bold text-danger hover:bg-[#3a1616]"
          >
            Delete my account
          </button>
        </form>
      </Card>
    </div>
  );
}
