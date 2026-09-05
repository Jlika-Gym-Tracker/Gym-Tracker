import { expect, test } from "@playwright/test";

/**
 * One smoke test per route.
 *
 * These run without a session, so the assertion for an authenticated route is
 * that it redirects to sign-in rather than erroring — that exercises the
 * middleware, the Supabase client and the route's module graph, which is what
 * a smoke test is for. Signed-in journeys need seeded fixtures and belong in a
 * separate suite.
 */

const PROTECTED = [
  "/", "/session", "/program", "/progress", "/nutrition", "/league", "/profile",
  "/onboarding",
];

test.describe("public routes render", () => {
  for (const [path, heading] of [
    ["/login", "Welcome back."],
    ["/signup", "Create your account."],
    ["/forgot-password", "Locked out?"],
  ] as const) {
    test(`${path} renders its heading`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    });
  }

  test("login page loads its fonts and theme", async ({ page }) => {
    await page.goto("/login");
    const body = page.locator("body");
    await expect(body).toHaveCSS("background-color", "rgb(8, 9, 10)");
    // Archivo must actually load — a fallback serif means the variable broke.
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family.toLowerCase()).toContain("archivo");
  });

  test("an unknown route under a public prefix shows the themed 404", async ({ page }) => {
    // Unknown routes elsewhere redirect to sign-in rather than confirming what
    // does and does not exist, so this checks the 404 where it is reachable.
    await page.goto("/login/definitely-not-a-page");
    await expect(page.getByRole("heading", { name: "Nothing here." })).toBeVisible();
  });

  test("an unknown private route redirects rather than revealing itself", async ({ page }) => {
    await page.goto("/definitely-not-a-page");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("protected routes require a session", () => {
  for (const path of PROTECTED) {
    test(`${path} redirects to sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
    });
  }
});

test.describe("api routes", () => {
  // maxRedirects: 0 so the redirect itself is the assertion — following it
  // would just report 200 for the sign-in page.
  test("exercise search refuses anonymous callers", async ({ request }) => {
    const response = await request.get("/api/exercises?q=press", { maxRedirects: 0 });
    expect([302, 307, 401]).toContain(response.status());
  });

  test("export refuses anonymous callers", async ({ request }) => {
    const response = await request.get("/api/export?format=json", { maxRedirects: 0 });
    expect([302, 307, 401]).toContain(response.status());
  });

  test("the cron endpoint refuses without its secret", async ({ request }) => {
    const response = await request.post("/api/cron/weekly-review", {
      headers: { Authorization: "Bearer definitely-wrong" },
    });
    expect([401, 503]).toContain(response.status());
  });
});

test.describe("pwa", () => {
  test("serves a manifest with the brand colours", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.name).toBe("JLIKA Gym");
    expect(manifest.theme_color).toBe("#08090a");
  });

  test("every manifest icon actually exists", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    for (const icon of manifest.icons) {
      const response = await request.get(icon.src);
      expect(response.status(), `${icon.src} should exist`).toBe(200);
    }
  });
});
