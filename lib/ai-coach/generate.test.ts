import { describe, expect, it } from "vitest";
import { CoachError, generate, type ModelRequest, type ModelTurn, type Transport } from "./generate";
import { strictJsonSchema } from "./json-schema";
import { validatePlan } from "./plan";
import { planOutputSchema } from "./schemas";
import { BROKEN_PLAN_REPLY, PLAN_REPLY } from "./__fixtures__/recorded";
import { CATALOG } from "./__fixtures__/catalog";

const turn = (text: string, over: Partial<ModelTurn> = {}): ModelTurn => ({
  text,
  content: [{ type: "text", text, citations: null }],
  usage: { input: 1000, output: 400, cacheRead: 200 },
  stopReason: "end_turn",
  ...over,
});

/** Replays recorded turns in order and keeps what it was asked. */
function replay(...turns: (ModelTurn | Error)[]) {
  const requests: ModelRequest[] = [];
  const transport: Transport = async (request) => {
    requests.push(structuredClone(request));
    const next = turns.shift();
    if (!next) throw new Error("no more recorded turns");
    if (next instanceof Error) throw next;
    return next;
  };
  return { transport, requests };
}

const plan = (transport: Transport, canRepair = () => true) =>
  generate({
    transport,
    system: [{ type: "text", text: "rules" }],
    user: "design",
    schema: planOutputSchema,
    jsonSchema: strictJsonSchema(planOutputSchema),
    check: (output) => validatePlan(output, CATALOG, { daysPerWeek: 4 }),
    maxTokens: 32000,
    canRepair,
  });

describe("generate", () => {
  it("returns a checked plan from a good first answer", async () => {
    const { transport, requests } = replay(turn(PLAN_REPLY));
    const result = await plan(transport);
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
    expect(requests[0]!.schema).toMatchObject({ type: "object", additionalProperties: false });
  });

  it("repairs once: shows the model its own answer and what was wrong", async () => {
    const broken = turn(BROKEN_PLAN_REPLY);
    const { transport, requests } = replay(broken, turn(PLAN_REPLY));
    const result = await plan(transport);

    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(result.usage).toEqual({ input: 2000, output: 800, cacheRead: 400 });

    const second = requests[1]!.messages;
    expect(second).toHaveLength(3);
    // Append-only: the first turn goes back exactly as it came.
    expect(second[1]).toEqual({ role: "assistant", content: broken.content });
    expect(second[2]!.content).toMatch(/nordic-hamstring-curl" is not in the catalog/);
  });

  it("fails cleanly after a second bad answer", async () => {
    const { transport } = replay(turn(BROKEN_PLAN_REPLY), turn(BROKEN_PLAN_REPLY));
    const result = await plan(transport);
    expect(result).toMatchObject({ ok: false, attempts: 2 });
    if (result.ok) return;
    expect(result.message).toMatch(/failed the checks twice, so nothing was saved/);
    expect(result.detail).toMatch(/^Invalid output: /);
  });

  it("skips the repair round when there is no time left for it", async () => {
    const { transport, requests } = replay(turn(BROKEN_PLAN_REPLY));
    const result = await plan(transport, () => false);
    expect(result.ok).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it("treats text that is not JSON, or not the shape, as a repairable answer", async () => {
    const { transport, requests } = replay(turn("Sure! Here is your plan:"), turn('{"label":"x"}'));
    const result = await plan(transport);
    expect(result.ok).toBe(false);
    expect(requests[1]!.messages[2]!.content).toMatch(/not valid JSON/);
  });

  it("stops at a refusal or a cut-off answer without repairing", async () => {
    const refused = replay(turn("", { stopReason: "refusal" }));
    expect(await plan(refused.transport)).toMatchObject({ ok: false, detail: "stop_reason: refusal" });
    expect(refused.requests).toHaveLength(1);

    const cut = replay(turn(PLAN_REPLY.slice(0, 200), { stopReason: "max_tokens" }));
    expect(await plan(cut.transport)).toMatchObject({ ok: false, detail: "stop_reason: max_tokens" });
  });

  it("passes on the transport's own message for API failures", async () => {
    const { transport } = replay(new CoachError("The AI Coach is getting too many requests right now.", "429 rate limited"));
    const result = await plan(transport);
    expect(result).toMatchObject({ ok: false, message: "The AI Coach is getting too many requests right now.", detail: "429 rate limited" });
  });

  it("never shows an unexpected error's text to the person", async () => {
    const { transport } = replay(new Error("ECONNRESET at socket 0x1f"));
    const result = await plan(transport);
    if (result.ok) throw new Error("expected failure");
    expect(result.message).toBe("The AI Coach hit an unexpected error. Nothing was changed.");
    expect(result.detail).toMatch(/ECONNRESET/);
  });
});
