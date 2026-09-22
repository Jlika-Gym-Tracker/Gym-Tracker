import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { applyPendingSignup } from "@/lib/auth/pending-signup";

/**
 * The single landing point for every way Supabase hands a session back.
 *
 * Three shapes arrive here and all three must be handled, because which one you
 * get depends on the email template and the provider:
 *
 *   ?error=…&error_code=…  Supabase refused — an expired or already-used link.
 *                          The reason is right there in the query string, so
 *                          pass it on rather than inventing a vaguer one.
 *   ?code=…                PKCE. The default email template and every OAuth
 *                          provider use this; it needs exchangeCodeForSession.
 *   ?token_hash=…&type=…   A template written with {{ .TokenHash }}, which
 *                          needs verifyOtp instead.
 *
 * Handling only one of them means a perfectly valid link fails and the user is
 * told the link was "incomplete".
 */
export async function landSession(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const fail = (code: string, description?: string | null) => {
    const url = new URL("/auth/auth-error", origin);
    url.searchParams.set("code", code);
    if (description) url.searchParams.set("description", description);
    const type = searchParams.get("type");
    if (type) url.searchParams.set("type", type);
    return NextResponse.redirect(url);
  };

  // Supabase said no before we ever got a token.
  const providerError = searchParams.get("error_code") ?? searchParams.get("error");
  if (providerError) {
    return fail(providerError, searchParams.get("error_description"));
  }

  const next = searchParams.get("next");
  const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!code && !tokenHash) return fail("missing_token");

  const supabase = await createClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ type: type ?? "email", token_hash: tokenHash! });

  if (error) return fail(error.code ?? "verification_failed", error.message);

  await applyPendingSignup(supabase);

  // Behind a proxy the load balancer sets x-forwarded-host; trust it in prod only.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base =
    process.env.NODE_ENV === "development" || !forwardedHost
      ? origin
      : `https://${forwardedHost}`;

  return NextResponse.redirect(`${base}${target}`);
}
