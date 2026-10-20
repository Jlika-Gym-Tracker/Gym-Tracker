import { describe, expect, it } from "vitest";
import { z } from "zod";
import { strictJsonSchema } from "./json-schema";
import { planOutputSchema, reviewOutputSchema } from "./schemas";

type Node = Record<string, unknown>;

/** Every object node in a schema, however deep. */
function objects(node: unknown, found: Node[] = []): Node[] {
  if (Array.isArray(node)) node.forEach((n) => objects(n, found));
  else if (node && typeof node === "object") {
    const n = node as Node;
    if (n.type === "object") found.push(n);
    Object.values(n).forEach((v) => objects(v, found));
  }
  return found;
}

describe("strictJsonSchema", () => {
  it("requires every key and allows no extras, at every level", () => {
    for (const schema of [planOutputSchema, reviewOutputSchema]) {
      for (const node of objects(strictJsonSchema(schema))) {
        expect(node.additionalProperties).toBe(false);
        expect(node.required).toEqual(Object.keys(node.properties as Node));
      }
    }
  });

  it("keeps enums and the change type's const, which the API enforces", () => {
    const review = strictJsonSchema(reviewOutputSchema) as { properties: { changes: { items: { anyOf: Node[] } } } };
    const variants = review.properties.changes.items.anyOf;
    expect(variants).toHaveLength(10);
    expect((variants[0]!.properties as Node).type).toEqual({ type: "string", const: "swap_exercise" });

    const plan = JSON.stringify(strictJsonSchema(planOutputSchema));
    expect(plan).toContain('"enum":["double","linear","greyskull","off"]');
  });

  it("moves bounds the API ignores into the description the model reads", () => {
    const schema = strictJsonSchema(z.object({ sets: z.number().int().min(1).max(10).describe("Working sets.") }));
    expect(schema).toEqual({
      type: "object",
      properties: { sets: { type: "integer", description: "Working sets.\n\n{minimum: 1, maximum: 10}" } },
      required: ["sets"],
      additionalProperties: false,
    });
  });

  it("writes nullable fields as anyOf with null", () => {
    const schema = strictJsonSchema(z.object({ note: z.string().nullable() })) as { properties: { note: Node } };
    expect(schema.properties.note).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
  });

  it("does not describe zod's safe-integer range as a bound", () => {
    const schema = strictJsonSchema(z.object({ n: z.number().int().nullable() })) as { properties: { n: Node } };
    expect(schema.properties.n).toEqual({ anyOf: [{ type: "integer" }, { type: "null" }] });
  });
});
