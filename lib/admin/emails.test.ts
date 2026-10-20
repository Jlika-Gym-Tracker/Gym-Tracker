import { describe, expect, it } from "vitest";
import { isAdminEmail, parseAdminEmails } from "@/lib/admin/emails";

describe("parseAdminEmails", () => {
  it("splits on commas, trims and lowercases", () => {
    expect([...parseAdminEmails(" Owner@Example.com ,ops@example.org,")]).toEqual([
      "owner@example.com",
      "ops@example.org",
    ]);
  });

  it("means nobody when unset or blank", () => {
    expect(parseAdminEmails(undefined).size).toBe(0);
    expect(parseAdminEmails(null).size).toBe(0);
    expect(parseAdminEmails("").size).toBe(0);
    expect(parseAdminEmails(" , ,").size).toBe(0);
  });

  it("drops entries that are not an address instead of half-matching them", () => {
    expect([...parseAdminEmails("example.com,@example.com,owner@,a b@example.com,ok@x.io")]).toEqual([
      "ok@x.io",
    ]);
  });
});

describe("isAdminEmail", () => {
  const list = "owner@example.com, Ops@Example.org";

  it("matches case-insensitively", () => {
    expect(isAdminEmail("OWNER@example.com", list)).toBe(true);
    expect(isAdminEmail("ops@example.org", list)).toBe(true);
  });

  it("matches the whole address only", () => {
    expect(isAdminEmail("wner@example.com", list)).toBe(false);
    expect(isAdminEmail("owner@example.com.evil.io", list)).toBe(false);
    expect(isAdminEmail("someone@example.com", list)).toBe(false);
  });

  it("is false with no email or no list", () => {
    expect(isAdminEmail(null, list)).toBe(false);
    expect(isAdminEmail(undefined, list)).toBe(false);
    expect(isAdminEmail("", list)).toBe(false);
    expect(isAdminEmail("owner@example.com", undefined)).toBe(false);
    expect(isAdminEmail("owner@example.com", "")).toBe(false);
  });
});
