import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The operator dashboard's privacy boundary, checked in the source.
 *
 * The app promises nobody can read anyone else's data. The dashboard holds the
 * secret key, which bypasses RLS — so the promise rests on what the dashboard's
 * code asks for. These tests fail if it ever asks for more than account-level
 * facts and counts.
 */

const MIGRATION = "supabase/migrations/20261020000034_admin.sql";
const SOURCES = ["lib/admin", "components/admin", "app/(app)/admin", "app/actions/admin.ts"];

/** Tables the dashboard may touch directly: its own, never a user's. */
const TABLES = new Set(["app_settings", "signup_invites"]);
/** The aggregate functions, plus the one boolean signup asks for. */
const FUNCTIONS = new Set([
  "admin_overview",
  "admin_accounts",
  "admin_training_now",
  "admin_end_sessions",
  "signup_invite_required",
]);
/** Every column an admin_* function may return. */
const COLUMNS = new Set([
  "accounts",
  "active_7d",
  "active_30d",
  "sessions_this_week",
  "disabled",
  "user_id",
  "email",
  "created_at",
  "last_sign_in_at",
  "finished_sessions",
  "last_trained_at",
  "open_session_since",
  "total",
  "started_at",
]);

function sourceFiles(entry: string): string[] {
  if (!fs.existsSync(entry)) return [];
  if (fs.statSync(entry).isFile()) return [entry];
  return fs.readdirSync(entry, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(entry, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

describe("operator dashboard privacy boundary", () => {
  const files = SOURCES.flatMap(sourceFiles);

  it("finds the dashboard's code", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("reads no user's tables, storage or other schemas directly", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(/\.from\(\s*["'`]([^"'`]+)["'`]/g)) {
        if (!TABLES.has(m[1]!)) offenders.push(`${file}: .from("${m[1]}")`);
      }
      for (const m of src.matchAll(/\.rpc\(\s*["'`]([^"'`]+)["'`]/g)) {
        if (!FUNCTIONS.has(m[1]!)) offenders.push(`${file}: .rpc("${m[1]}")`);
      }
      if (/\.storage\b/.test(src)) offenders.push(`${file}: .storage`);
      if (/\.schema\(/.test(src)) offenders.push(`${file}: .schema()`);
    }
    expect(offenders).toEqual([]);
  });

  it("returns only account-level columns from the aggregate functions", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    const functions = [
      ...sql.matchAll(
        /create or replace function public\.(admin_\w+)\([^)]*\)\s*returns\s+table\s*\(([^)]*)\)/g,
      ),
    ];
    expect(functions.map((f) => f[1])).toEqual(["admin_overview", "admin_accounts", "admin_training_now"]);

    const leaked = functions.flatMap(([, name, columns]) =>
      columns!
        .split(",")
        .map((c) => c.trim().split(/\s+/)[0]!)
        .filter((c) => !COLUMNS.has(c))
        .map((c) => `${name}.${c}`),
    );
    expect(leaked).toEqual([]);
  });

  it("lets only the secret key run the aggregate functions", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    const grants = [...sql.matchAll(/grant execute on function public\.(admin_\w+)\([^)]*\) to ([^;]+);/g)];
    expect(grants.length).toBe(4);
    for (const [, name, roles] of grants) expect(`${name}: ${roles!.trim()}`).toBe(`${name}: service_role`);

    for (const name of ["admin_overview", "admin_accounts", "admin_training_now", "admin_end_sessions"]) {
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`),
      );
    }
  });

  it("keeps the signup codes away from every user role", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    for (const table of ["app_settings", "signup_invites"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated;`);
      expect(sql).not.toMatch(new RegExp(`create policy [^;]* on public\\.${table}`));
    }
  });
});
