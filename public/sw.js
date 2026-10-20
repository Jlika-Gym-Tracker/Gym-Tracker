/*
 * JLIKA Gym service worker — push notifications, and nothing else.
 *
 * It is registered only when someone turns notifications on (lib/push/client.ts)
 * and deliberately has no fetch handler: no offline caching, so it can never
 * serve a stale page. All it does is show the rest-timer and workout-day
 * notifications the server pushes, and open the app when one is tapped.
 */

self.addEventListener("install", () => {
  // Nothing to precache, so there is no reason to wait for old tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Safari (iOS and macOS) revokes a site's push subscription after a few pushes
 * that show nothing, so there every push must end in a notification — even one
 * the open app is already beeping for. Other browsers allow a push to stay
 * silent while the site is on screen.
 */
function mustAlwaysShow() {
  const ua = self.navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Safari\//.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/.test(ua));
}

/** Only ever a path inside this app; anything else opens the home screen. */
function safePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data ? event.data.json() : {};
      } catch {
        data = { body: event.data ? event.data.text() : "" };
      }

      // When the app is open and in front, the page plays its own beep; a
      // banner on top of it would be the same news twice. A test asks to be
      // shown regardless — it is sent from the screen you're looking at.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const watching = windows.some((w) => w.visibilityState === "visible" && w.focused);
      if (watching && data.always !== true && !mustAlwaysShow()) return;

      const tag = typeof data.tag === "string" ? data.tag : undefined;
      await self.registration.showNotification(typeof data.title === "string" ? data.title : "JLIKA Gym", {
        body: typeof data.body === "string" ? data.body : "",
        tag,
        // A new rest alert replaces the last one, and should still buzz.
        renotify: Boolean(tag),
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: safePath(data.url) },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const app = windows.filter((w) => new URL(w.url).origin === url.origin);
      // Prefer a window already on that page; otherwise bring any app window
      // forward and take it there.
      const exact = app.find((w) => new URL(w.url).pathname === url.pathname);
      const target = exact || app[0];
      if (target) {
        await target.focus();
        if (!exact && "navigate" in target) {
          // Only works for a window this worker controls; focusing is enough otherwise.
          await target.navigate(url.href).catch(() => {});
        }
        return;
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
