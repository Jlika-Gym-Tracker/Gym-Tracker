import { describe, expect, it } from "vitest";
import { DEFAULT_AI_COACH_DAILY_LIMIT, DEFAULT_AI_COACH_MODEL, readAiCoachEnv } from "./env";

describe("readAiCoachEnv", () => {
  it("is off without a key", () => {
    expect(readAiCoachEnv({}).mode).toBe("off");
    expect(readAiCoachEnv({ ANTHROPIC_API_KEY: "  " }).mode).toBe("off");
  });

  it("is live with a key, on the default model and cap", () => {
    expect(readAiCoachEnv({ ANTHROPIC_API_KEY: "sk-ant-x" })).toEqual({
      mode: "live",
      model: DEFAULT_AI_COACH_MODEL,
      dailyLimit: DEFAULT_AI_COACH_DAILY_LIMIT,
    });
    expect(DEFAULT_AI_COACH_MODEL).toBe("claude-opus-5-5");
  });

  it("takes the model and a sane cap from the environment", () => {
    const env = readAiCoachEnv({ ANTHROPIC_API_KEY: "k", AI_COACH_MODEL: "claude-sonnet-5-5", AI_COACH_DAILY_LIMIT: "3" });
    expect(env).toMatchObject({ model: "claude-sonnet-5-5", dailyLimit: 3 });
    for (const bad of ["0", "-2", "lots", "100000"]) {
      expect(readAiCoachEnv({ ANTHROPIC_API_KEY: "k", AI_COACH_DAILY_LIMIT: bad }).dailyLimit).toBe(10);
    }
  });

  it("runs on fixtures without a key, but never in production", () => {
    expect(readAiCoachEnv({ AI_COACH_FIXTURE: "1", NODE_ENV: "development" })).toMatchObject({ mode: "fixture", model: "fixture" });
    expect(readAiCoachEnv({ AI_COACH_FIXTURE: "1", NODE_ENV: "production" }).mode).toBe("off");
    // A real key wins over the fixture flag.
    expect(readAiCoachEnv({ AI_COACH_FIXTURE: "1", ANTHROPIC_API_KEY: "k" }).mode).toBe("live");
  });
});
