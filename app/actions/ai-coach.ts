"use server";

/**
 * The AI Coach's server actions.
 *
 * Long calls: designing or reviewing a week can take a minute. These run as
 * Server Actions invoked from /ai-coach, so they inherit that page's
 * `maxDuration` (app/(app)/ai-coach/page.tsx) on serverless hosts — no job
 * queue, no polling endpoint, nothing to keep alive between requests. Each
 * run carries a deadline below that limit (RUN_BUDGET_MS) so the model call,
 * its retry and the repair round all finish, or fail cleanly and get logged,
 * before the platform would cut the request off. The page shows its own
 * progress while it waits.
 *
 * Every action re-checks, on the server: the coach is configured, the person
 * is signed in, they consented, and (for model runs) they are under the cap.
 */

import { revalidatePath } from "next/cache";
import { format, parseISO } from "date-fns";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dayLabel, toDateString } from "@/lib/dates";
import { getWeekStartsOn } from "@/lib/settings/week";
import type { AiCoachRunKind, Json, UnitSystem } from "@/lib/database.types";
import { aiCoachConfig } from "@/lib/ai-coach/config";
import { claudeTransport } from "@/lib/ai-coach/claude";
import { generate, type Generated, type Transport } from "@/lib/ai-coach/generate";
import { fixturePlanOutput, fixtureRefineOutput, fixtureReviewOutput, fixtureTransport } from "@/lib/ai-coach/fixtures";
import { strictJsonSchema } from "@/lib/ai-coach/json-schema";
import {
  ageOn,
  buildCatalog,
  buildReviewPayload,
  catalogText,
  planForModel,
  REVIEW_WINDOW_DAYS,
  type PlanRequestContext,
} from "@/lib/ai-coach/payload";
import { checkPlanAgainstCatalog, planToWeek, validatePlan, validPlanSchema, type ValidPlan } from "@/lib/ai-coach/plan";
import { applyChanges, validateChanges } from "@/lib/ai-coach/changes";
import {
  PLAN_SYSTEM,
  REVIEW_SYSTEM,
  catalogBlock,
  planUserMessage,
  refineUserMessage,
  reviewUserMessage,
} from "@/lib/ai-coach/prompts";
import {
  changeSchema,
  intakeSchema,
  planOutputSchema,
  reviewOutputSchema,
  weekSnapshotSchema,
  type CatalogEntry,
  type Change,
  type Intake,
} from "@/lib/ai-coach/schemas";
import {
  findReviewBase,
  getCatalog,
  getIntake,
  getRejectedChanges,
  getReviewRows,
  getWeekSnapshot,
  resolveWeekStarts,
  type Supabase,
} from "@/lib/ai-coach/queries";
import { snapshotAndWrite, writeWeek } from "@/lib/ai-coach/writer";
import { exerciseCount, weekFingerprint, weekHasContent } from "@/lib/ai-coach/week";

export type AiCoachResult = {
  error?: string;
  notice?: string;
  /** The target week already has content; ask before replacing it. */
  needsConfirm?: { weekStart: string; label: string; exercises: number };
};

/** Under the page's maxDuration (300 s), with room to log the outcome. */
const RUN_BUDGET_MS = 270_000;
/** A repair round is only worth starting with at least this much time left. */
const REPAIR_NEEDS_MS = 75_000;

const PLAN_MAX_TOKENS = 32_000;
const REVIEW_MAX_TOKENS = 24_000;

const uuid = z.uuid();
const targetSchema = z.enum(["this", "next"]);

/** A failure whose message is fit to show as-is. */
class Refusal extends Error {}

function fail(error: unknown): AiCoachResult {
  if (error instanceof Refusal) return { error: error.message };
  if (error instanceof z.ZodError) {
    return { error: `Check your answers: ${error.issues.map((i) => i.message).slice(0, 3).join("; ")}` };
  }
  console.error("[ai-coach]", error);
  return { error: "Something went wrong. Nothing was changed." };
}

function refresh() {
  revalidatePath("/ai-coach");
  revalidatePath("/program");
  revalidatePath("/");
}

async function requireCoach({ consent = true } = {}) {
  const config = aiCoachConfig();
  if (config.mode === "off") throw new Refusal("The AI Coach is not available on this server.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Refusal("Not signed in.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("ai_coach_consented_at, unit_system, sex, birth_date, height_cm")
    .eq("id", user.id)
    .maybeSingle();
  if (consent && !profile?.ai_coach_consented_at) {
    throw new Refusal("Turn on the AI Coach first.");
  }
  return { supabase, userId: user.id, config, profile };
}

async function weekStartFor(supabase: Supabase, userId: string, target: "this" | "next") {
  const today = toDateString(new Date());
  const weeks = await resolveWeekStarts(supabase, userId, today, await getWeekStartsOn());
  return { ...weeks, today, weekStart: target === "this" ? weeks.thisWeek : weeks.nextWeek };
}

function weekName(weekStart: string) {
  return `the week of ${format(parseISO(weekStart), "MMM d")}`;
}

// ------------------------------------------------------------------- runs

async function startRun(supabase: Supabase, kind: AiCoachRunKind, model: string, limit: number) {
  const { data, error } = await supabase.rpc("ai_coach_start_run", {
    p_kind: kind,
    p_model: model,
    p_daily_limit: limit,
  });
  if (error?.message.includes("ai_coach_daily_limit")) {
    throw new Refusal(
      `You've used all ${limit} AI Coach runs for the last 24 hours. They free up 24 hours after each one started.`,
    );
  }
  if (error || !data) throw error ?? new Error("Could not start the run.");
  return data;
}

async function finishRun(supabase: Supabase, runId: string, result: Generated<unknown>) {
  const { error } = await supabase.rpc("ai_coach_finish_run", {
    p_run: runId,
    p_status: result.ok ? "succeeded" : "failed",
    p_input_tokens: result.usage.input,
    p_output_tokens: result.usage.output,
    p_cache_read_tokens: result.usage.cacheRead,
    p_error: result.ok ? null : result.detail,
  });
  if (error) console.error("[ai-coach] could not close run", error);
}

function transportFor(
  config: ReturnType<typeof aiCoachConfig>,
  deadline: number,
  fixture: () => unknown,
): Transport {
  return config.mode === "live" ? claudeTransport({ model: config.model, deadline }) : fixtureTransport(fixture);
}

function systemBlocks(rules: string, catalog: CatalogEntry[]) {
  return [
    { type: "text" as const, text: rules },
    // The catalog is the same from one request to the next for a person, so a
    // refine or a second review within a few minutes reads it from cache.
    { type: "text" as const, text: catalogBlock(catalogText(catalog)), cache_control: { type: "ephemeral" as const } },
  ];
}

async function planContext(
  supabase: Supabase,
  userId: string,
  intake: Intake,
  profile: { sex: string | null; birth_date: string | null; height_cm: number | null } | null,
): Promise<{ catalog: CatalogEntry[]; context: PlanRequestContext }> {
  const catalog = buildCatalog(await getCatalog(supabase, userId), intake.equipment);
  if (catalog.length < 4) {
    throw new Refusal("Your library has too few movements for that equipment to build a week. Add equipment or exercises.");
  }
  const { thisWeek, today } = await weekStartFor(supabase, userId, "this");
  const labels = Array.from({ length: 7 }, (_, i) => dayLabel(thisWeek, i));

  return {
    catalog,
    context: {
      goal: intake.goal,
      experience: intake.experience,
      days_per_week: intake.daysPerWeek,
      preferred_days: intake.preferredDays.map((i) => labels[i]!),
      session_minutes: intake.sessionMinutes,
      equipment: intake.equipment,
      body: intake.shareBodyDetails
        ? {
            sex: profile?.sex ?? null,
            age: ageOn(profile?.birth_date ?? null, today),
            height_cm: profile?.height_cm == null ? null : Number(profile.height_cm),
          }
        : null,
      week_days: labels.map((weekday, day_index) => ({ day_index, weekday })),
    },
  };
}

// ---------------------------------------------------------------- consent

export async function setAiCoachConsent(consent: boolean, erase = false): Promise<AiCoachResult> {
  try {
    const { supabase, userId } = await requireCoach({ consent: false });
    const { error } = await supabase
      .from("profiles")
      .update({ ai_coach_consented_at: z.boolean().parse(consent) ? new Date().toISOString() : null })
      .eq("id", userId);
    if (error) throw error;

    if (!consent && erase) {
      // Runs stay: they hold no training data, and they are what the daily
      // cap counts.
      await supabase.from("ai_coach_snapshots").delete().eq("user_id", userId);
      await supabase.from("ai_coach_proposals").delete().eq("user_id", userId);
      await supabase.from("ai_coach_intakes").delete().eq("user_id", userId);
    }

    refresh();
    return {
      notice: consent
        ? "AI Coach turned on."
        : erase
          ? "AI Coach turned off and its history deleted. Your program is untouched."
          : "AI Coach turned off. Nothing more will be sent.",
    };
  } catch (error) {
    return fail(error);
  }
}

// ------------------------------------------------------------ plan design

async function storePlan(
  supabase: Supabase,
  userId: string,
  runId: string,
  plan: ValidPlan,
  parentId: string | null,
) {
  const now = new Date().toISOString();
  await supabase
    .from("ai_coach_proposals")
    .update({ status: "superseded", decided_at: now })
    .eq("user_id", userId)
    .eq("kind", "plan")
    .eq("status", "pending");

  const { error } = await supabase.from("ai_coach_proposals").insert({
    user_id: userId,
    run_id: runId,
    kind: "plan",
    summary: plan.summary,
    payload: plan as unknown as Json,
    parent_id: parentId,
  });
  if (error) throw error;
}

export async function designPlan(input: unknown): Promise<AiCoachResult> {
  try {
    const { supabase, userId, config, profile } = await requireCoach();
    const intake = intakeSchema.parse(input);

    const { error: intakeError } = await supabase
      .from("ai_coach_intakes")
      .upsert({ user_id: userId, answers: intake as unknown as Json, updated_at: new Date().toISOString() });
    if (intakeError) throw intakeError;

    const { catalog, context } = await planContext(supabase, userId, intake, profile);
    const runId = await startRun(supabase, "plan", config.model, config.dailyLimit);
    const deadline = Date.now() + RUN_BUDGET_MS;

    const result = await generate({
      transport: transportFor(config, deadline, () => fixturePlanOutput(catalog, intake)),
      system: systemBlocks(PLAN_SYSTEM, catalog),
      user: planUserMessage(context, intake),
      schema: planOutputSchema,
      jsonSchema: strictJsonSchema(planOutputSchema),
      check: (output) => validatePlan(output, catalog, intake),
      maxTokens: PLAN_MAX_TOKENS,
      canRepair: () => deadline - Date.now() > REPAIR_NEEDS_MS,
    });
    await finishRun(supabase, runId, result);
    if (!result.ok) {
      revalidatePath("/ai-coach");
      return { error: result.message };
    }

    await storePlan(supabase, userId, runId, result.value, null);
    revalidatePath("/ai-coach");
    return { notice: "Your draft week is ready. Nothing is saved to your program until you accept it." };
  } catch (error) {
    return fail(error);
  }
}

async function pendingPlan(supabase: Supabase, userId: string, proposalId: string) {
  const { data } = await supabase
    .from("ai_coach_proposals")
    .select("id, payload, status, kind")
    .eq("id", uuid.parse(proposalId))
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.kind !== "plan") throw new Refusal("That draft no longer exists.");
  if (data.status !== "pending") throw new Refusal("That draft has already been decided.");
  const parsed = validPlanSchema.safeParse(data.payload);
  if (!parsed.success) throw new Refusal("That draft could not be read. Design a new one.");
  return parsed.data;
}

export async function refinePlan(proposalId: string, request: string): Promise<AiCoachResult> {
  try {
    const { supabase, userId, config, profile } = await requireCoach();
    const text = z
      .string()
      .trim()
      .min(3, "Say what you'd like changed.")
      .max(500, "Keep it under 500 characters.")
      .parse(request);
    const previous = await pendingPlan(supabase, userId, proposalId);
    const intake = await getIntake(supabase, userId);
    if (!intake) throw new Refusal("Answer the intake again before refining.");

    const { catalog, context } = await planContext(supabase, userId, intake, profile);
    const runId = await startRun(supabase, "refine", config.model, config.dailyLimit);
    const deadline = Date.now() + RUN_BUDGET_MS;

    const result = await generate({
      transport: transportFor(config, deadline, () => fixtureRefineOutput(previous)),
      system: systemBlocks(PLAN_SYSTEM, catalog),
      user: refineUserMessage(context, intake, previous, text),
      schema: planOutputSchema,
      jsonSchema: strictJsonSchema(planOutputSchema),
      check: (output) => validatePlan(output, catalog, intake),
      maxTokens: PLAN_MAX_TOKENS,
      canRepair: () => deadline - Date.now() > REPAIR_NEEDS_MS,
    });
    await finishRun(supabase, runId, result);
    if (!result.ok) {
      revalidatePath("/ai-coach");
      return { error: result.message };
    }

    await storePlan(supabase, userId, runId, result.value, proposalId);
    revalidatePath("/ai-coach");
    return { notice: "Revised. Review the new draft below." };
  } catch (error) {
    return fail(error);
  }
}

export async function acceptPlan(
  proposalId: string,
  target: "this" | "next",
  confirmReplace: boolean,
): Promise<AiCoachResult> {
  try {
    const { supabase, userId } = await requireCoach();
    const plan = await pendingPlan(supabase, userId, proposalId);
    const { weekStart } = await weekStartFor(supabase, userId, targetSchema.parse(target));

    const missing = checkPlanAgainstCatalog(plan, await getCatalog(supabase, userId));
    if (missing.length) throw new Refusal(`${missing.join(" ")} Design a new week.`);

    const current = await getWeekSnapshot(supabase, userId, weekStart);
    if (weekHasContent(current) && !confirmReplace) {
      return {
        needsConfirm: { weekStart, label: current.week?.label ?? "", exercises: exerciseCount(current) },
      };
    }

    await snapshotAndWrite({ supabase, userId, weekStart, target: planToWeek(plan, current), proposalId });
    await supabase
      .from("ai_coach_proposals")
      .update({ status: "applied", applied_week_start: weekStart, decided_at: new Date().toISOString() })
      .eq("id", proposalId)
      .eq("user_id", userId);

    refresh();
    return {
      notice: `Saved as a draft for ${weekName(weekStart)}. Edit or publish it from Program; Revert below puts back what was there.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function dismissProposal(proposalId: string): Promise<AiCoachResult> {
  try {
    const { supabase, userId } = await requireCoach({ consent: false });
    const id = uuid.parse(proposalId);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("ai_coach_proposals")
      .update({ status: "dismissed", decided_at: now })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("kind")
      .maybeSingle();
    if (error) throw error;
    if (data?.kind === "review") {
      // Turning a whole review down is turning down each of its changes.
      await supabase
        .from("ai_coach_changes")
        .update({ decision: "rejected", decided_at: now })
        .eq("proposal_id", id)
        .eq("decision", "pending");
    }
    revalidatePath("/ai-coach");
    return { notice: data?.kind === "review" ? "Review dismissed. Its suggestions won't come back without new evidence." : "Draft dismissed." };
  } catch (error) {
    return fail(error);
  }
}

// ----------------------------------------------------------------- review

function unitsOf(profile: { unit_system?: string | null } | null): UnitSystem {
  return profile?.unit_system === "imperial" ? "imperial" : "metric";
}

export async function runReview(): Promise<AiCoachResult> {
  try {
    const { supabase, userId, config, profile } = await requireCoach();
    const { thisWeek, today } = await weekStartFor(supabase, userId, "this");

    const base = await findReviewBase(supabase, userId, thisWeek);
    if (!base) throw new Refusal("There's no plan with exercises to review yet. Design or write a week first.");

    const [library, rows, rejected, intake] = await Promise.all([
      getCatalog(supabase, userId),
      getReviewRows(supabase, userId, today, REVIEW_WINDOW_DAYS),
      getRejectedChanges(supabase, userId),
      getIntake(supabase, userId),
    ]);
    const dayLabels = Array.from({ length: 7 }, (_, i) => dayLabel(base.weekStart, i));

    const payload = buildReviewPayload({
      today,
      base: base.week,
      baseWeekStart: base.weekStart,
      dayLabels,
      catalog: library,
      ...rows,
      sessionMinutes: intake?.sessionMinutes ?? null,
      rejected,
    });
    if (payload.adherence.sessions_completed === 0) {
      throw new Refusal("Finish a few sessions first — there's nothing logged in the last four weeks to review.");
    }

    // The model chooses new movements from the equipment the person has; the
    // plan's own movements stay in so it can name what it would change.
    const inPlan = new Set(base.week.days.flatMap((d) => d.exercises.map((e) => e.exercise_id)));
    const offered = buildCatalog(library, intake?.equipment);
    const catalog = [...offered, ...library.filter((e) => inPlan.has(e.id) && !offered.includes(e))];
    const context = { catalog: library, dayLabels, units: unitsOf(profile) };

    const runId = await startRun(supabase, "review", config.model, config.dailyLimit);
    const deadline = Date.now() + RUN_BUDGET_MS;

    const result = await generate({
      transport: transportFor(config, deadline, () => fixtureReviewOutput(planForModel(base.week, library, dayLabels))),
      system: systemBlocks(REVIEW_SYSTEM, catalog),
      user: reviewUserMessage(payload, intake),
      schema: reviewOutputSchema,
      jsonSchema: strictJsonSchema(reviewOutputSchema),
      check: (output) => {
        const checked = validateChanges(output.changes, base.week, context);
        return checked.ok ? { ok: true, value: { output, changes: checked.value } } : checked;
      },
      maxTokens: REVIEW_MAX_TOKENS,
      canRepair: () => deadline - Date.now() > REPAIR_NEEDS_MS,
    });
    await finishRun(supabase, runId, result);
    if (!result.ok) {
      revalidatePath("/ai-coach");
      return { error: result.message };
    }

    const now = new Date().toISOString();
    await supabase
      .from("ai_coach_proposals")
      .update({ status: "superseded", decided_at: now })
      .eq("user_id", userId)
      .eq("kind", "review")
      .eq("status", "pending");

    const { output, changes } = result.value;
    const { data: proposal, error } = await supabase
      .from("ai_coach_proposals")
      .insert({
        user_id: userId,
        run_id: runId,
        kind: "review",
        summary: output.summary,
        payload: { advice: output.advice, fingerprint: weekFingerprint(base.week) } as unknown as Json,
        base_week_start: base.weekStart,
      })
      .select("id")
      .single();
    if (error) throw error;

    if (changes.length) {
      const { error: changesError } = await supabase.from("ai_coach_changes").insert(
        changes.map((c, position) => ({
          proposal_id: proposal.id,
          position,
          type: c.change.type,
          change: c.change as unknown as Json,
          target_text: c.target,
          before_text: c.before,
          after_text: c.after,
          rationale: c.change.rationale,
        })),
      );
      if (changesError) throw changesError;
    }

    revalidatePath("/ai-coach");
    return {
      notice: changes.length
        ? `${changes.length} suggested change${changes.length === 1 ? "" : "s"}. Tick the ones you want.`
        : "Review done — no changes needed.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function applyReview(
  proposalId: string,
  acceptedIds: string[],
  target: "this" | "next",
  confirmReplace: boolean,
): Promise<AiCoachResult> {
  try {
    const { supabase, userId, profile } = await requireCoach();
    const id = uuid.parse(proposalId);
    const accepted = new Set(z.array(uuid).max(50).parse(acceptedIds));
    if (accepted.size === 0) throw new Refusal("Tick at least one change, or dismiss the review.");

    const { data: proposal } = await supabase
      .from("ai_coach_proposals")
      .select("id, kind, status, payload, base_week_start")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proposal || proposal.kind !== "review" || !proposal.base_week_start) {
      throw new Refusal("That review no longer exists.");
    }
    if (proposal.status !== "pending") throw new Refusal("That review has already been decided.");

    const { data: rows, error: rowsError } = await supabase
      .from("ai_coach_changes")
      .select("id, change, position")
      .eq("proposal_id", id)
      .order("position");
    if (rowsError) throw rowsError;

    const picked: Change[] = [];
    for (const row of rows ?? []) {
      if (!accepted.has(row.id)) continue;
      const parsed = changeSchema.safeParse(row.change);
      if (!parsed.success) throw new Refusal("A change in this review could not be read. Run a new review.");
      picked.push(parsed.data);
    }
    if (picked.length !== accepted.size) throw new Refusal("Some of those changes are not part of this review.");

    // The plan may have been edited since the review read it. Re-check what
    // was ticked against the plan as it is now, and refuse rather than guess.
    const library = await getCatalog(supabase, userId);
    const base = await getWeekSnapshot(supabase, userId, proposal.base_week_start);
    const dayLabels = Array.from({ length: 7 }, (_, i) => dayLabel(proposal.base_week_start!, i));
    const recheck = validateChanges(picked, base, { catalog: library, dayLabels, units: unitsOf(profile) });
    if (!recheck.ok) {
      throw new Refusal(
        `Your plan has changed since this review, and some ticked changes no longer fit (${recheck.errors[0]}). Run a new review.`,
      );
    }

    const { weekStart } = await weekStartFor(supabase, userId, targetSchema.parse(target));
    if (weekStart !== proposal.base_week_start) {
      const existing = await getWeekSnapshot(supabase, userId, weekStart);
      if (weekHasContent(existing) && !confirmReplace) {
        return { needsConfirm: { weekStart, label: existing.week?.label ?? "", exercises: exerciseCount(existing) } };
      }
    }

    const next = applyChanges(base, recheck.value.map((r) => r.change), library);
    await snapshotAndWrite({ supabase, userId, weekStart, target: next, proposalId: id });

    const now = new Date().toISOString();
    const acceptedList = [...accepted];
    await supabase
      .from("ai_coach_changes")
      .update({ decision: "accepted", decided_at: now })
      .eq("proposal_id", id)
      .in("id", acceptedList);
    // What was left unticked was turned down; the next review is told so.
    await supabase
      .from("ai_coach_changes")
      .update({ decision: "rejected", decided_at: now })
      .eq("proposal_id", id)
      .eq("decision", "pending");
    await supabase
      .from("ai_coach_proposals")
      .update({ status: "applied", applied_week_start: weekStart, decided_at: now })
      .eq("id", id)
      .eq("user_id", userId);

    refresh();
    return {
      notice: `Applied ${picked.length} change${picked.length === 1 ? "" : "s"} to ${weekName(weekStart)}, as a draft. Revert below puts back what was there.`,
    };
  } catch (error) {
    return fail(error);
  }
}

// ----------------------------------------------------------------- revert

/**
 * Puts a week back exactly as a snapshot holds it. Only the plan moves:
 * sessions and logged sets stay as they are, because the log is what happened.
 */
export async function revertSnapshot(snapshotId: string): Promise<AiCoachResult> {
  try {
    const { supabase, userId } = await requireCoach({ consent: false });
    const { data: row } = await supabase
      .from("ai_coach_snapshots")
      .select("id, week_start, snapshot, reverted_at, proposal_id")
      .eq("id", uuid.parse(snapshotId))
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) throw new Refusal("That snapshot no longer exists.");
    if (row.reverted_at) throw new Refusal("That change was already reverted.");

    const parsed = weekSnapshotSchema.safeParse(row.snapshot);
    if (!parsed.success) throw new Refusal("That snapshot could not be read.");

    // A custom movement deleted since cannot be put back; everything else can.
    const known = new Set((await getCatalog(supabase, userId)).map((e) => e.id));
    const all = parsed.data.days.flatMap((day) => day.exercises);
    const dropped = all.filter((e) => !known.has(e.exercise_id)).length;
    const snapshot = {
      ...parsed.data,
      days: parsed.data.days.map((day) => ({
        ...day,
        exercises: day.exercises.filter((e) => known.has(e.exercise_id)),
      })),
    };

    const current = await getWeekSnapshot(supabase, userId, row.week_start);
    await writeWeek({ supabase, userId, weekStart: row.week_start, current, target: snapshot });

    const now = new Date().toISOString();
    await supabase.from("ai_coach_snapshots").update({ reverted_at: now }).eq("id", row.id).eq("user_id", userId);
    if (row.proposal_id) {
      await supabase
        .from("ai_coach_proposals")
        .update({ status: "reverted", decided_at: now })
        .eq("id", row.proposal_id)
        .eq("user_id", userId);
    }

    refresh();
    return {
      notice:
        `Reverted ${weekName(row.week_start)} to how it was before. Logged sessions are untouched.` +
        (dropped ? ` ${dropped} exercise${dropped === 1 ? "" : "s"} you have since deleted from your library could not be restored.` : ""),
    };
  } catch (error) {
    return fail(error);
  }
}
