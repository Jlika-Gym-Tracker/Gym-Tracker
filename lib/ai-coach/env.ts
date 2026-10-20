/**
 * Reads the AI Coach's environment. Pure, so it can be tested without the
 * server; lib/ai-coach/config.ts is the server-only door the app goes through.
 *
 * The coach exists only when ANTHROPIC_API_KEY is set. Without it every caller
 * sees `mode: "off"` and nothing renders, nothing is requested.
 */

/**
 * The model the AI Coach uses unless AI_COACH_MODEL says otherwise. Claude
 * Opus 5.5 is the current Opus: it writes a whole week of programming in one
 * pass and holds the closed exercise list and the change rules well.
 */
export const DEFAULT_AI_COACH_MODEL = "claude-opus-5-5";

/** Runs (plan, refine or review) per account in any 24 hours. */
export const DEFAULT_AI_COACH_DAILY_LIMIT = 10;

export type AiCoachMode = "off" | "live" | "fixture";

export type AiCoachEnv = {
  mode: AiCoachMode;
  model: string;
  dailyLimit: number;
};

type Env = Record<string, string | undefined>;

export function readAiCoachEnv(env: Env): AiCoachEnv {
  const key = env.ANTHROPIC_API_KEY?.trim();
  // Canned answers for clicking through the loop locally. Never in production:
  // a stray variable must not put fake coaching in front of real people.
  const fixture = env.AI_COACH_FIXTURE === "1" && env.NODE_ENV !== "production";

  const mode: AiCoachMode = key ? "live" : fixture ? "fixture" : "off";
  const model = env.AI_COACH_MODEL?.trim() || DEFAULT_AI_COACH_MODEL;

  const parsed = Number.parseInt(env.AI_COACH_DAILY_LIMIT ?? "", 10);
  const dailyLimit =
    Number.isFinite(parsed) && parsed >= 1 && parsed <= 1000 ? parsed : DEFAULT_AI_COACH_DAILY_LIMIT;

  return { mode, model: mode === "fixture" ? "fixture" : model, dailyLimit };
}
