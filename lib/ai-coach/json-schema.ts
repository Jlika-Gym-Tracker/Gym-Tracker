/**
 * Turns a zod schema into the JSON schema dialect structured outputs accept.
 *
 * The API constrains decoding to `type`, `enum`, `const`, `anyOf`, objects with
 * every key required and no extras, and arrays. Bounds such as `minimum` or
 * `maxLength` are not enforced there, so they move into the description where
 * the model still reads them, and zod enforces them when the answer comes back.
 *
 * The SDK ships a similar helper, but it also demotes `enum` and `const` to
 * descriptions, which would leave the change type and every rule name
 * unconstrained.
 */

import { z } from "zod";

type Node = { [key: string]: unknown };

const STRING_FORMATS = new Set([
  "date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid",
]);

export function strictJsonSchema(schema: z.ZodType): Node {
  const raw = z.toJSONSchema(schema, { unrepresentable: "throw" }) as Node;
  return strict(raw);
}

function strict(node: Node): Node {
  // zod writes a bare nullable as `type: ["string", "null"]`; spell it as the
  // anyOf form the API documents.
  if (Array.isArray(node.type)) {
    const { type, ...rest } = node;
    return {
      anyOf: (type as string[]).map((t) => (t === "null" ? { type: "null" } : strict({ ...rest, type: t }))),
    };
  }

  const out: Node = {};
  const notes: string[] = [];

  for (const [key, value] of Object.entries(node)) {
    // zod's integers carry the safe-integer range; that is not a constraint
    // worth telling the model about.
    if ((key === "minimum" && value === Number.MIN_SAFE_INTEGER) || (key === "maximum" && value === Number.MAX_SAFE_INTEGER)) {
      continue;
    }
    switch (key) {
      case "type":
      case "enum":
      case "const":
      case "description":
      case "title":
      case "required":
        out[key] = value;
        break;
      case "anyOf":
      case "oneOf":
        out.anyOf = (value as Node[]).map(strict);
        break;
      case "allOf":
        out.allOf = (value as Node[]).map(strict);
        break;
      case "properties":
        out.properties = Object.fromEntries(
          Object.entries(value as Record<string, Node>).map(([name, child]) => [name, strict(child)]),
        );
        break;
      case "items":
        out.items = strict(value as Node);
        break;
      case "format":
        if (typeof value === "string" && STRING_FORMATS.has(value)) out.format = value;
        else notes.push(`format: ${JSON.stringify(value)}`);
        break;
      case "minItems":
        if (value === 0 || value === 1) out.minItems = value;
        else notes.push(`minItems: ${JSON.stringify(value)}`);
        break;
      case "$schema":
      case "additionalProperties":
        // Dropped: the first is noise, the second is forced below.
        break;
      default:
        notes.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  if (out.type === "object") {
    out.properties ??= {};
    out.required = Object.keys(out.properties as Node);
    out.additionalProperties = false;
  }

  if (notes.length > 0) {
    const bounds = `{${notes.join(", ")}}`;
    out.description = typeof out.description === "string" ? `${out.description}\n\n${bounds}` : bounds;
  }
  return out;
}
