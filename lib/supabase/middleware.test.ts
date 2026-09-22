import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/**
 * A deployment with no Supabase environment used to 500 every route with
 * MIDDLEWARE_INVOCATION_FAILED, which names neither the cause nor the fix.
 */
describe("updateSession with no Supabase environment", () => {
  it("says which variables are missing instead of throwing", async () => {
    for (const k of KEYS) delete process.env[k];

    const response = await updateSession(new NextRequest("https://jlika.example/login"));
    const body = await response.text();

    expect(response.status).toBe(503);
    for (const k of KEYS) expect(body).toContain(k);
    expect(body).toContain("redeploy");
  });

  it("names only the one that is missing", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const body = await (await updateSession(new NextRequest("https://jlika.example/"))).text();

    expect(body).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(body).not.toContain("NEXT_PUBLIC_SUPABASE_URL\n");
  });
});
