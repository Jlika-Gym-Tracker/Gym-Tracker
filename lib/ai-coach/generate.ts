/**
 * One request to the model, checked, with a single chance to fix itself.
 *
 * The transport is passed in — the real one (claude.ts) talks to Anthropic,
 * the fixture one answers from canned output, and tests hand in recorded
 * replies — so this loop is tested without a network.
 *
 * Flow: ask → parse JSON → zod → domain check. If anything fails and there is
 * time left, the model is shown its own answer and the list of problems, once.
 * A second failure ends the run with a message; nothing is saved.
 */

import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaTextBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { repairMessage } from "./prompts";
import type { Checked } from "./plan";

export type Usage = { input: number; output: number; cacheRead: number };

export type ModelTurn = {
  /** The text the structured answer arrived in. */
  text: string;
  /** The whole assistant turn, appended unchanged for the repair round. */
  content: BetaContentBlock[];
  usage: Usage;
  stopReason: string | null;
};

export type ModelRequest = {
  system: BetaTextBlockParam[];
  messages: BetaMessageParam[];
  /** JSON schema for structured output (json-schema.ts). */
  schema: Record<string, unknown>;
  maxTokens: number;
};

export type Transport = (request: ModelRequest) => Promise<ModelTurn>;

/**
 * A failure the person can be shown. `message` is for the screen; `detail`
 * goes to the run log (status codes, which check failed) and never carries a
 * stack trace or the key.
 */
export class CoachError extends Error {
  constructor(
    message: string,
    readonly detail: string = message,
  ) {
    super(message);
    this.name = "CoachError";
  }
}

export type Generated<V> =
  | { ok: true; value: V; usage: Usage; attempts: number }
  | { ok: false; message: string; detail: string; usage: Usage; attempts: number };

export const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0 };

const add = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
});

export async function generate<T, V>({
  transport,
  system,
  user,
  schema,
  jsonSchema,
  check,
  maxTokens,
  canRepair = () => true,
}: {
  transport: Transport;
  system: BetaTextBlockParam[];
  user: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  check: (value: T) => Checked<V>;
  maxTokens: number;
  /** Asked before the repair round: false when the time budget is nearly spent. */
  canRepair?: () => boolean;
}): Promise<Generated<V>> {
  const messages: BetaMessageParam[] = [{ role: "user", content: user }];
  let usage = EMPTY_USAGE;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let turn: ModelTurn;
    try {
      turn = await transport({ system, messages, schema: jsonSchema, maxTokens });
    } catch (error) {
      const failure =
        error instanceof CoachError
          ? error
          : new CoachError("The AI Coach hit an unexpected error. Nothing was changed.", describe(error));
      return { ok: false, message: failure.message, detail: failure.detail, usage, attempts: attempt };
    }
    usage = add(usage, turn.usage);

    if (turn.stopReason === "refusal") {
      return {
        ok: false,
        message: "The AI Coach declined this request. Try rephrasing what you typed.",
        detail: "stop_reason: refusal",
        usage,
        attempts: attempt,
      };
    }
    if (turn.stopReason === "max_tokens") {
      return {
        ok: false,
        message: "The AI Coach's answer ran too long and was cut off. Nothing was saved — try again.",
        detail: "stop_reason: max_tokens",
        usage,
        attempts: attempt,
      };
    }

    let result: Checked<V>;
    try {
      result = read(turn.text, schema, check);
    } catch (error) {
      // A bug in a check must still close the run, not leave it hanging.
      return {
        ok: false,
        message: "The AI Coach hit an unexpected error. Nothing was changed.",
        detail: describe(error),
        usage,
        attempts: attempt,
      };
    }
    if (result.ok) return { ok: true, value: result.value, usage, attempts: attempt };

    if (attempt === 2 || !canRepair()) {
      return {
        ok: false,
        message:
          attempt === 2
            ? "The AI Coach's answer failed the checks twice, so nothing was saved. Try again in a moment."
            : "The AI Coach's answer failed the checks and there was no time left to fix it. Nothing was saved.",
        detail: `Invalid output: ${result.errors.slice(0, 6).join(" | ")}`.slice(0, 480),
        usage,
        attempts: attempt,
      };
    }

    // Append-only: the turn goes back exactly as it came, then the problems.
    messages.push({ role: "assistant", content: turn.content });
    messages.push({ role: "user", content: repairMessage(result.errors) });
  }

  // Unreachable: the loop returns on every path of its second pass.
  return { ok: false, message: "Nothing was saved.", detail: "unreachable", usage, attempts: 2 };
}

/** JSON, then shape, then meaning — the first failing layer's problems. */
export function read<T, V>(text: string, schema: z.ZodType<T>, check: (value: T) => Checked<V>): Checked<V> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The answer was not valid JSON. Return only the JSON object."] };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 12).map((issue) => `${issue.path.join(".") || "answer"}: ${issue.message}`),
    };
  }
  return check(parsed.data);
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : "Unknown error";
}
