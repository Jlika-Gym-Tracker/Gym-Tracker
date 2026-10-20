/**
 * What the AI Coach page renders, as plain serialisable data. Built on the
 * server by lib/ai-coach/state.ts; read by components/ai-coach.
 */

import type {
  AiCoachChangeType,
  AiCoachProposalStatus,
  AiCoachRunKind,
  AiCoachRunStatus,
  UnitSystem,
} from "@/lib/database.types";
import type { ValidPlan } from "./plan";
import type { Intake } from "./schemas";

export type PlanView = ValidPlan & { proposalId: string; createdAt: string; refined: boolean };

export type ChangeView = {
  id: string;
  type: AiCoachChangeType;
  target: string;
  before: string;
  after: string;
  rationale: string;
};

export type ReviewView = {
  proposalId: string;
  createdAt: string;
  summary: string;
  advice: string[];
  baseWeekStart: string;
  changes: ChangeView[];
};

export type SnapshotView = {
  id: string;
  weekStart: string;
  createdAt: string;
  revertedAt: string | null;
  what: string;
};

export type RunView = {
  id: string;
  kind: AiCoachRunKind;
  status: AiCoachRunStatus;
  model: string;
  createdAt: string;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
};

export type DecisionView = {
  id: string;
  at: string;
  status: AiCoachProposalStatus;
  text: string;
  details: string[];
};

export type WeekSlot = { weekStart: string; label: string | null; exercises: number };

export type AiCoachView = {
  consentedAt: string | null;
  fixture: boolean;
  model: string;
  dailyLimit: number;
  runsUsed: number;
  intake: Intake | null;
  intakeDefaults: Intake;
  /** Weekday per day_index for this person's weeks, e.g. ["Mon", …]. */
  dayLabels: string[];
  thisWeek: WeekSlot;
  nextWeek: WeekSlot;
  plan: PlanView | null;
  review: ReviewView | null;
  snapshots: SnapshotView[];
  runs: RunView[];
  decisions: DecisionView[];
  units: UnitSystem;
};
