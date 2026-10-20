import "server-only";
import { format, parseISO, subHours } from "date-fns";
import { dayLabel, toDateString } from "@/lib/dates";
import { getWeekStartsOn } from "@/lib/settings/week";
import type { AiCoachChangeType, AiCoachProposalStatus, Goal, UnitSystem } from "@/lib/database.types";
import { aiCoachConfig } from "./config";
import { validPlanSchema } from "./plan";
import { getIntake, getWeekSnapshot, resolveWeekStarts, type Supabase } from "./queries";
import type { Intake } from "./schemas";
import type { AiCoachView, DecisionView, ReviewView, SnapshotView, WeekSlot } from "./view";
import { exerciseCount } from "./week";

const FULL_GYM: Intake["equipment"] = ["barbell", "dumbbell", "machine", "cable", "body_only"];

/** Everything the AI Coach page shows, for the signed-in user. */
export async function getAiCoachView(supabase: Supabase, userId: string): Promise<AiCoachView> {
  const config = aiCoachConfig();
  const today = toDateString(new Date());
  const startsOn = await getWeekStartsOn();

  const [{ data: profile }, { data: settings }, intake, weeks] = await Promise.all([
    supabase
      .from("profiles")
      .select("ai_coach_consented_at, goal, unit_system")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_settings").select("training_days").eq("user_id", userId).maybeSingle(),
    getIntake(supabase, userId),
    resolveWeekStarts(supabase, userId, today, startsOn),
  ]);

  const consentedAt = profile?.ai_coach_consented_at ?? null;
  const trainingDays = [...new Set(settings?.training_days ?? [])].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  const intakeDefaults: Intake = {
    goal: (profile?.goal ?? "health") as Goal,
    experience: "some",
    daysPerWeek: trainingDays.length || 3,
    preferredDays: trainingDays,
    sessionMinutes: 60,
    equipment: FULL_GYM,
    limitations: "",
    likes: "",
    dislikes: "",
    shareBodyDetails: false,
  };

  const base: Omit<AiCoachView, "thisWeek" | "nextWeek"> = {
    consentedAt,
    fixture: config.mode === "fixture",
    model: config.model,
    dailyLimit: config.dailyLimit,
    runsUsed: 0,
    intake,
    intakeDefaults,
    dayLabels: Array.from({ length: 7 }, (_, i) => dayLabel(weeks.thisWeek, i)),
    plan: null,
    review: null,
    snapshots: [],
    runs: [],
    decisions: [],
    units: (profile?.unit_system ?? "metric") as UnitSystem,
  };

  // Without consent the page only shows the consent screen; read nothing else.
  if (!consentedAt) {
    return {
      ...base,
      thisWeek: { weekStart: weeks.thisWeek, label: null, exercises: 0 },
      nextWeek: { weekStart: weeks.nextWeek, label: null, exercises: 0 },
    };
  }

  const [thisWeek, nextWeek] = await Promise.all([
    slot(supabase, userId, weeks.thisWeek),
    slot(supabase, userId, weeks.nextWeek),
  ]);

  const since = subHours(new Date(), 24).toISOString();
  const [{ data: runs }, { count: runsUsed }, { data: proposals }, { data: snapshots }] = await Promise.all([
    supabase
      .from("ai_coach_runs")
      .select("id, kind, status, model, created_at, input_tokens, output_tokens, error")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    // The same count the cap uses (ai_coach_start_run): every run in 24 hours.
    supabase
      .from("ai_coach_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gt("created_at", since),
    supabase
      .from("ai_coach_proposals")
      .select("id, kind, status, summary, payload, base_week_start, applied_week_start, parent_id, created_at, decided_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("ai_coach_snapshots")
      .select("id, proposal_id, week_start, created_at, reverted_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const proposalList = proposals ?? [];
  const reviewIds = proposalList.filter((p) => p.kind === "review").map((p) => p.id);
  const { data: changes } = reviewIds.length
    ? await supabase
        .from("ai_coach_changes")
        .select("id, proposal_id, position, type, target_text, before_text, after_text, rationale, decision")
        .in("proposal_id", reviewIds)
        .order("position")
    : { data: [] };
  const changesOf = (proposalId: string) => (changes ?? []).filter((c) => c.proposal_id === proposalId);

  // ------------------------------------------------------------- drafts
  const pendingPlan = proposalList.find((p) => p.kind === "plan" && p.status === "pending");
  const parsedPlan = pendingPlan ? validPlanSchema.safeParse(pendingPlan.payload) : null;
  const plan =
    pendingPlan && parsedPlan?.success
      ? {
          ...parsedPlan.data,
          proposalId: pendingPlan.id,
          createdAt: pendingPlan.created_at,
          refined: pendingPlan.parent_id != null,
        }
      : null;

  const pendingReview = proposalList.find((p) => p.kind === "review" && p.status === "pending");
  let review: ReviewView | null = null;
  if (pendingReview?.base_week_start) {
    const payload = (pendingReview.payload ?? {}) as { advice?: unknown };
    review = {
      proposalId: pendingReview.id,
      createdAt: pendingReview.created_at,
      summary: pendingReview.summary ?? "",
      advice: Array.isArray(payload.advice) ? payload.advice.filter((a): a is string => typeof a === "string") : [],
      baseWeekStart: pendingReview.base_week_start,
      changes: changesOf(pendingReview.id).map((c) => ({
        id: c.id,
        type: c.type as AiCoachChangeType,
        target: c.target_text,
        before: c.before_text,
        after: c.after_text,
        rationale: c.rationale,
      })),
    };
  }

  // ---------------------------------------------------------- snapshots
  const proposalById = new Map(proposalList.map((p) => [p.id, p]));
  const snapshotViews: SnapshotView[] = (snapshots ?? []).map((s) => {
    const p = s.proposal_id ? proposalById.get(s.proposal_id) : undefined;
    const accepted = p ? changesOf(p.id).filter((c) => c.decision === "accepted").length : 0;
    return {
      id: s.id,
      weekStart: s.week_start,
      createdAt: s.created_at,
      revertedAt: s.reverted_at,
      what: !p
        ? "AI Coach change"
        : p.kind === "plan"
          ? "Drafted week accepted"
          : `${accepted} review change${accepted === 1 ? "" : "s"} applied`,
    };
  });

  // ---------------------------------------------------------- decisions
  const week = (date: string | null) => (date ? ` — week of ${format(parseISO(date), "MMM d")}` : "");
  const decisions: DecisionView[] = proposalList
    .filter((p) => p.decided_at && p.status !== "pending")
    .slice(0, 20)
    .map((p) => {
      const status = p.status as AiCoachProposalStatus;
      const own = changesOf(p.id);
      const accepted = own.filter((c) => c.decision === "accepted");
      const rejected = own.filter((c) => c.decision === "rejected");
      const text =
        p.kind === "plan"
          ? {
              applied: `Accepted a drafted week${week(p.applied_week_start)}`,
              dismissed: "Dismissed a drafted week",
              superseded: "Replaced a draft with a refined one",
              reverted: `Reverted an accepted week${week(p.applied_week_start)}`,
              pending: "Draft waiting",
            }[status]
          : {
              applied: `Applied ${accepted.length} of ${own.length} review changes${week(p.applied_week_start)}`,
              dismissed: `Dismissed a review${own.length ? ` (${own.length} changes turned down)` : ""}`,
              superseded: "A newer review replaced this one",
              reverted: `Reverted ${accepted.length} applied review change${accepted.length === 1 ? "" : "s"}${week(p.applied_week_start)}`,
              pending: "Review waiting",
            }[status];
      return {
        id: p.id,
        at: p.decided_at!,
        status,
        text,
        details: [
          ...accepted.map((c) => `✓ ${c.target_text}: ${c.before_text} → ${c.after_text}`),
          ...rejected.map((c) => `✕ ${c.target_text}: ${c.before_text} → ${c.after_text}`),
        ],
      };
    });

  return {
    ...base,
    thisWeek,
    nextWeek,
    runsUsed: runsUsed ?? 0,
    plan,
    review,
    snapshots: snapshotViews,
    runs: (runs ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      model: r.model,
      createdAt: r.created_at,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      error: r.error,
    })),
    decisions,
  };
}

async function slot(supabase: Supabase, userId: string, weekStart: string): Promise<WeekSlot> {
  const week = await getWeekSnapshot(supabase, userId, weekStart);
  return { weekStart, label: week.week?.label ?? null, exercises: exerciseCount(week) };
}
