import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { CoachError, type ModelTurn, type Transport } from "./generate";

/**
 * The real transport: one streamed request to Anthropic.
 *
 * - Streaming, because a whole week of programming can take a minute or more
 *   to write and a long non-streaming request risks an HTTP timeout. The SDK's
 *   finalMessage() collects it; nothing is shown token by token.
 * - Structured output (output_config.format), so the reply is JSON in the
 *   requested shape; generate.ts still checks it with zod and the domain rules.
 * - Effort "medium": a week plan or a four-week review is moderate reasoning,
 *   and the person is waiting on a spinner. It is also Opus 5.5's default,
 *   stated so it does not shift underneath us.
 * - Server-side fallback ("default"): if the model declines a benign request
 *   on a policy false positive, Anthropic retries it on its default fallback
 *   in the same call. On models without fallbacks it is a no-op.
 * - A deadline shared by every attempt, so retries and the repair round can
 *   never outlive the route's maxDuration and leave a run hanging.
 */
export function claudeTransport({ model, deadline }: { model: string; deadline: number }): Transport {
  // Reads ANTHROPIC_API_KEY from the environment. One SDK retry covers a blip;
  // more would eat the time budget the person is waiting on.
  const client = new Anthropic({ maxRetries: 1 });

  return async ({ system, messages, schema, maxTokens }): Promise<ModelTurn> => {
    const remaining = deadline - Date.now();
    if (remaining < 5_000) {
      throw new CoachError("The AI Coach ran out of time. Nothing was changed — try again.", "deadline reached before request");
    }

    try {
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: maxTokens,
          system,
          messages,
          output_config: { effort: "medium", format: { type: "json_schema", schema } },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { timeout: remaining, signal: AbortSignal.timeout(remaining) },
      );
      const message = await stream.finalMessage();

      const text = message.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("");
      return {
        text,
        content: message.content,
        usage: {
          input: message.usage.input_tokens ?? 0,
          output: message.usage.output_tokens ?? 0,
          cacheRead: message.usage.cache_read_input_tokens ?? 0,
        },
        stopReason: message.stop_reason,
      };
    } catch (error) {
      throw toCoachError(error);
    }
  };
}

/** Most specific first: the person gets a sentence, the run log gets the code. */
export function toCoachError(error: unknown): CoachError {
  if (error instanceof CoachError) return error;

  if (error instanceof Anthropic.APIUserAbortError || error instanceof Anthropic.APIConnectionTimeoutError) {
    return new CoachError(
      "The AI Coach took too long to answer, so nothing was changed. Try again in a moment.",
      "timeout",
    );
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new CoachError("Couldn't reach the AI Coach service. Check the connection and try again.", "connection error");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new CoachError(
      "The AI Coach is getting too many requests right now. Wait a minute and try again.",
      "429 rate limited",
    );
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new CoachError(
      "The AI Coach isn't set up correctly on this server. Let whoever runs this app know.",
      `${error.status} API key rejected`,
    );
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new CoachError(
      "The AI Coach isn't set up correctly on this server. Let whoever runs this app know.",
      "404 model not found — check AI_COACH_MODEL",
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new CoachError("The AI Coach couldn't take this request. Nothing was changed.", `400 ${error.message}`.slice(0, 300));
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new CoachError(
      "Anthropic's service is overloaded or having trouble. Try again in a few minutes.",
      `${error.status} server error`,
    );
  }
  if (error instanceof Anthropic.APIError) {
    return new CoachError("The AI Coach hit an error. Nothing was changed.", `${error.status ?? "?"} ${error.message}`.slice(0, 300));
  }
  if (error instanceof Anthropic.AnthropicError) {
    return new CoachError("The AI Coach's answer could not be read. Nothing was changed.", error.message.slice(0, 300));
  }
  return new CoachError("The AI Coach hit an unexpected error. Nothing was changed.", "unexpected error");
}
