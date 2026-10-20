import "server-only";
import { readAiCoachEnv, type AiCoachEnv } from "./env";

/** The AI Coach's settings for this server. Never reaches the browser. */
export function aiCoachConfig(): AiCoachEnv {
  return readAiCoachEnv(process.env);
}

/** True when the nav item and the page should exist at all. */
export function isAiCoachAvailable(): boolean {
  return aiCoachConfig().mode !== "off";
}
