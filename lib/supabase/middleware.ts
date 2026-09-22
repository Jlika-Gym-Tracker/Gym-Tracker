import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

/**
 * Routes reachable without a session. Everything else redirects to /login.
 *
 * /api/cron is here because the scheduler authenticates with a shared secret
 * rather than a cookie; the handler itself refuses to run without it.
 */
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth",
  "/forgot-password",
  // A coach's invite link has to open for someone with no account yet; the
  // page itself reveals nothing until there is a session.
  "/join",
  "/api/cron",
  // The PWA manifest and its icons are fetched by the browser before there is
  // any session, and by installers that never have one.
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Without these, there is no app: no session, no data, nothing to render. */
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

export async function updateSession(request: NextRequest) {
  // createServerClient throws on a missing url or key. This middleware matches
  // every route, so that throw takes the whole deployment down with an opaque
  // MIDDLEWARE_INVOCATION_FAILED — which says nothing about the cause. Name it
  // instead: .env.local is gitignored, so a new deployment has none of this
  // until it is set in the host's environment settings.
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return new NextResponse(
      `JLIKA Gym is not configured.\n\n${missing.join("\n")}\n\n` +
        `${missing.length > 1 ? "These are" : "This is"} not set in this ` +
        `environment. Add ${missing.length > 1 ? "them" : "it"} to the ` +
        `deployment's environment variables and redeploy.\n`,
      {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      },
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getUser(): a stray await here
  // makes the session refresh race and randomly logs users out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
