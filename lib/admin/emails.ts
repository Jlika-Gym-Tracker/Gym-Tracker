/**
 * Who is an operator: the addresses in ADMIN_EMAILS.
 *
 * Pure, so it can be tested without the server; lib/admin/access.ts is the
 * server-only door the app goes through, and it compares against the signed-in
 * user's verified email on every request.
 *
 * Comma-separated and case-insensitive. Whitespace around entries is ignored,
 * and anything without an @ is dropped rather than half-matched. Unset or
 * empty means nobody is an admin and the dashboard does not exist.
 */
export function parseAdminEmails(raw: string | null | undefined): ReadonlySet<string> {
  const emails = new Set<string>();
  for (const entry of (raw ?? "").split(",")) {
    const email = entry.trim().toLowerCase();
    // One @, something either side, and no spaces: a typo should fail closed.
    if (/^[^\s@]+@[^\s@]+$/.test(email)) emails.add(email);
  }
  return emails;
}

/** Exact, case-insensitive match against the list. Never a prefix or a domain. */
export function isAdminEmail(
  email: string | null | undefined,
  raw: string | null | undefined,
): boolean {
  const candidate = email?.trim().toLowerCase();
  if (!candidate) return false;
  return parseAdminEmails(raw).has(candidate);
}
