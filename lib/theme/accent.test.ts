import { describe, expect, it } from "vitest";
import { ACCENTS, ACCENT_BOOT_SCRIPT, isAccent } from "./accent";

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

describe("accents", () => {
  it("keep the dark button label readable on every accent", () => {
    const label = luminance("#0a0c0d");
    for (const accent of ACCENTS) {
      const ratio = (luminance(accent.hex) + 0.05) / (label + 0.05);
      expect(ratio, accent.key).toBeGreaterThanOrEqual(8);
    }
  });

  it("recognises only known keys", () => {
    expect(isAccent("lime")).toBe(true);
    expect(isAccent("red")).toBe(false);
    expect(isAccent(undefined)).toBe(false);
  });

  it("boots only a known key from the cookie", () => {
    for (const accent of ACCENTS) expect(ACCENT_BOOT_SCRIPT).toContain(`"${accent.key}"`);
    expect(ACCENT_BOOT_SCRIPT).not.toContain("innerHTML");
  });
});
