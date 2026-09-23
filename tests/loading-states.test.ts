import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const files = (dir: string, match: RegExp): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? files(full, match) : match.test(e.name) ? [full] : [];
      })
    : [];

/**
 * Every screen behind the app shell must have a skeleton, or navigating to it
 * leaves the content area blank for as long as its queries take — which is how
 * /coach shipped.
 */
describe("route loading boundaries", () => {
  it("covers every signed-in route", () => {
    const pages = files("app/(app)", /^page\.tsx$/);
    expect(pages.length).toBeGreaterThan(5);

    const uncovered = pages.filter((page) => {
      // A loading.tsx in the route's own folder or any ancestor up to app/.
      for (let dir = path.dirname(page); dir.startsWith("app"); dir = path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, "loading.tsx"))) return false;
      }
      return true;
    });

    expect(uncovered).toEqual([]);
  });
});

/**
 * A raw <button type="submit"> gives no sign that a server action is running,
 * so the button invites a second press — which for "Finish session" means
 * finishing twice. ActionButton and SubmitButton both disable and spin.
 */
describe("submit buttons report their progress", () => {
  it("no form contains a plain submit button", () => {
    const sources = [...files("components", /\.tsx$/), ...files("app", /\.tsx$/)].filter(
      (f) => !f.endsWith("action-button.tsx") && !f.endsWith("submit-button.tsx"),
    );

    const offenders: string[] = [];
    for (const file of sources) {
      const src = fs.readFileSync(file, "utf8");
      for (const match of src.matchAll(/<form\b/g)) {
        const end = src.indexOf("</form>", match.index);
        const block = src.slice(match.index, end === -1 ? undefined : end);
        for (const button of block.matchAll(/<button\b[^>]*>/g)) {
          // type="button" does not submit, so it drives no action.
          if (/type="(button|reset)"/.test(button[0])) continue;
          const line = src.slice(0, match.index + button.index!).split("\n").length;
          offenders.push(`${file}:${line}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * Buttons outside a form get no useFormStatus, so nothing disables them while
 * their write is in flight and a second tap sends a second write. They must
 * either carry their own guard or go through AsyncButton, which owns one.
 */
describe("action buttons outside forms guard themselves", () => {
  it("every button that runs an action also disables", () => {
    const offenders: string[] = [];
    for (const file of files("components", /\.tsx$/)) {
      const src = fs.readFileSync(file, "utf8");
      for (const match of src.matchAll(/<button\b/g)) {
        // Walk to the tag's closing ">", ignoring braces and strings.
        let i = match.index! + 7;
        let depth = 0;
        let quote: string | null = null;
        while (i < src.length) {
          const c = src[i]!;
          if (quote) {
            if (c === quote) quote = null;
          } else if (`"'\``.includes(c)) quote = c;
          else if (c === "{") depth++;
          else if (c === "}") depth--;
          else if (c === ">" && depth === 0) break;
          i++;
        }
        const tag = src.slice(match.index!, i);
        const onClick = /onClick=\{([\s\S]*?)\}\s*(?=\n\s*[a-zA-Z-]+=|\n\s*>|$)/.exec(tag);
        const handler = onClick?.[1] ?? "";
        const runsAction = /\brun\(|startTransition\(/.test(handler);
        if (runsAction && !/\bdisabled[=}]/.test(tag)) {
          offenders.push(`${file}:${src.slice(0, match.index!).split("\n").length}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
