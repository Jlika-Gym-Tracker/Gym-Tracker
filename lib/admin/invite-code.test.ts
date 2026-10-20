import { describe, expect, it } from "vitest";
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_EXAMPLE,
  INVITE_CODE_PATTERN,
  generateInviteCode,
  inviteExpiry,
  inviteStatus,
  newInviteSchema,
  normalizeInviteCode,
} from "@/lib/admin/invite-code";

describe("generateInviteCode", () => {
  it("makes codes the database's check constraint accepts", () => {
    for (let i = 0; i < 200; i++) expect(generateInviteCode()).toMatch(INVITE_CODE_PATTERN);
  });

  it("maps random bytes onto the alphabet", () => {
    const bytes = Uint8Array.from({ length: 12 }, (_, i) => i * 21);
    const code = generateInviteCode(() => bytes);
    expect(code).toMatch(INVITE_CODE_PATTERN);
    const all = generateInviteCode(() => Uint8Array.from({ length: 12 }, (_, i) => i));
    expect(all).toBe("JLIKA-ABCD-EFGH-JKLM");
    expect(generateInviteCode(() => new Uint8Array(12).fill(255))).toBe("JLIKA-9999-9999-9999");
  });

  it("has no look-alike characters", () => {
    expect(INVITE_CODE_ALPHABET).toHaveLength(32);
    for (const c of "IO01") expect(INVITE_CODE_ALPHABET).not.toContain(c);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateInviteCode()));
    expect(seen.size).toBe(500);
  });
});

describe("normalizeInviteCode", () => {
  it("accepts the canonical form", () => {
    expect(normalizeInviteCode("JLIKA-7K2P-QX4M-H9RT")).toBe("JLIKA-7K2P-QX4M-H9RT");
    expect(normalizeInviteCode(INVITE_CODE_EXAMPLE)).toMatch(INVITE_CODE_PATTERN);
  });

  it("forgives case, spaces, dashes and a missing prefix", () => {
    expect(normalizeInviteCode(" jlika 7k2p qx4m h9rt ")).toBe("JLIKA-7K2P-QX4M-H9RT");
    expect(normalizeInviteCode("JLIKA7K2PQX4MH9RT")).toBe("JLIKA-7K2P-QX4M-H9RT");
    expect(normalizeInviteCode("7k2p-qx4m-h9rt")).toBe("JLIKA-7K2P-QX4M-H9RT");
  });

  it("refuses anything that cannot be a code", () => {
    expect(normalizeInviteCode("")).toBeNull();
    expect(normalizeInviteCode(undefined)).toBeNull();
    expect(normalizeInviteCode(42)).toBeNull();
    expect(normalizeInviteCode("CREW-7K2P")).toBeNull();
    expect(normalizeInviteCode("JLIKA-7K2P-QX4M")).toBeNull();
    expect(normalizeInviteCode("JLIKA-7K2P-QX4M-H9RTX")).toBeNull();
    // O and 1 are not in the alphabet: a misread code fails here, clearly.
    expect(normalizeInviteCode("JLIKA-7K2P-QX4M-H9RO")).toBeNull();
    expect(normalizeInviteCode("JLIKA-7K2P-QX4M-H9R1")).toBeNull();
  });
});

describe("inviteStatus", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const base = { uses: 0, max_uses: 1, expires_at: null, revoked_at: null };

  it("is active with uses left, no expiry and no revocation", () => {
    expect(inviteStatus(base, now)).toBe("active");
    expect(inviteStatus({ ...base, expires_at: "2026-10-21T00:00:00Z" }, now)).toBe("active");
  });

  it("expires at the instant, not after it", () => {
    expect(inviteStatus({ ...base, expires_at: "2026-10-20T12:00:00Z" }, now)).toBe("expired");
    expect(inviteStatus({ ...base, expires_at: "2026-10-19T00:00:00Z" }, now)).toBe("expired");
  });

  it("is used up when every use is spent", () => {
    expect(inviteStatus({ ...base, uses: 1 }, now)).toBe("used_up");
    expect(inviteStatus({ ...base, uses: 2, max_uses: 3 }, now)).toBe("active");
  });

  it("reports revoked over everything else", () => {
    expect(
      inviteStatus({ uses: 1, max_uses: 1, expires_at: "2026-01-01T00:00:00Z", revoked_at: "2026-02-01T00:00:00Z" }, now),
    ).toBe("revoked");
  });
});

describe("newInviteSchema", () => {
  it("reads the form's strings", () => {
    expect(newInviteSchema.parse({ maxUses: "5", expiresInDays: "7", note: "  Sam  " })).toEqual({
      maxUses: 5,
      expiresInDays: 7,
      note: "Sam",
    });
    expect(newInviteSchema.parse({ maxUses: "1", expiresInDays: "0", note: "" }).note).toBeNull();
  });

  it("refuses out-of-range uses and unknown lifetimes", () => {
    expect(newInviteSchema.safeParse({ maxUses: "0", expiresInDays: "7", note: "" }).success).toBe(false);
    expect(newInviteSchema.safeParse({ maxUses: "101", expiresInDays: "7", note: "" }).success).toBe(false);
    expect(newInviteSchema.safeParse({ maxUses: "1.5", expiresInDays: "7", note: "" }).success).toBe(false);
    expect(newInviteSchema.safeParse({ maxUses: "1", expiresInDays: "3", note: "" }).success).toBe(false);
    expect(newInviteSchema.safeParse({ maxUses: "1", expiresInDays: "7", note: "x".repeat(61) }).success).toBe(false);
  });
});

describe("inviteExpiry", () => {
  it("adds whole days, or never", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(inviteExpiry(7, now)).toBe("2026-10-27T12:00:00.000Z");
    expect(inviteExpiry(0, now)).toBeNull();
  });
});
