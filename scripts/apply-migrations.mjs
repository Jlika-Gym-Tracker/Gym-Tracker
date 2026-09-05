import fs from "node:fs";

/**
 * Applies supabase/migrations/*.sql through the Supabase Management API.
 *
 * Needs SUPABASE_ACCESS_TOKEN (a personal access token, sbp_...) in .env.local.
 * That token reaches every project on the account, so it lives only on your
 * machine — the app itself never reads it.
 *
 * Every migration is idempotent, so re-running is safe. Stops at the first
 * failure rather than pressing on with a half-applied schema.
 *
 *   node scripts/apply-migrations.mjs
 */

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const token = env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_SECRET_KEY;
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set in .env.local.");
  process.exit(1);
}

const only = process.argv[2];
const files = fs
  .readdirSync("supabase/migrations")
  .sort()
  .filter((f) => (only ? f.includes(only) : true));

for (const file of files) {
  const query = fs.readFileSync(`supabase/migrations/${file}`, "utf8");
  process.stdout.write(`${file.replace(/^\d+_/, "").padEnd(28)} `);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (res.ok) {
    console.log("applied");
  } else {
    console.log(`FAILED ${res.status}`);
    console.log("   " + text.slice(0, 400));
    process.exit(1);
  }
}
console.log("\nall migrations applied");
