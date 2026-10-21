/**
 * Web push in the browser: what this device can do, and turning it on or off.
 *
 * Plain functions with no server imports, safe from any client component. The
 * service worker is registered here and nowhere else, so a lifter who never
 * turns notifications on never gets one.
 */

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
export const SERVICE_WORKER_URL = "/sw.js";

/**
 * unconfigured  the deployment has no VAPID keys
 * unsupported   this browser has no web push
 * ios-install   iPhone/iPad in a browser tab: push only works from the Home Screen app
 * denied        the lifter (or the browser) blocked notifications for this site
 * off           could be turned on
 * on            subscribed on this device
 */
export type PushState = "unconfigured" | "unsupported" | "ios-install" | "denied" | "off" | "on";

export function pushConfiguredHere(): boolean {
  return PUBLIC_KEY.length > 0;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch screen gives it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone;
  return legacy === true || window.matchMedia("(display-mode: standalone)").matches;
}

function hasPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

/** This device's subscription, if it has one. Never registers anything. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!hasPush()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function readPushState(): Promise<PushState> {
  if (!pushConfiguredHere()) return "unconfigured";
  if (!hasPush()) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  return (await currentSubscription()) ? "on" : "off";
}

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameBytes(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a) return false;
  const left = new Uint8Array(a);
  return left.length === b.length && left.every((byte, i) => byte === b[i]);
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

type Outcome = { ok: true } | { ok: false; state?: PushState; error: string };

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function errorFrom(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Asks for permission, registers the service worker and subscribes. Must be
 * called straight from a tap: Safari only shows the permission prompt in
 * response to one, so nothing may be awaited before asking.
 */
export async function enablePush(): Promise<Outcome> {
  if (!pushConfiguredHere()) return { ok: false, state: "unconfigured", error: "Push notifications aren't configured on this deployment." };
  if (!hasPush()) return { ok: false, state: isIos() && !isStandalone() ? "ios-install" : "unsupported", error: "This browser can't receive notifications." };

  const permission = await Notification.requestPermission();
  if (permission === "denied") return { ok: false, state: "denied", error: "Notifications are blocked for this site." };
  if (permission !== "granted") return { ok: false, state: "off", error: "Notifications weren't allowed. Try again when you're ready." };

  try {
    await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
    const registration = await navigator.serviceWorker.ready;
    const key = urlBase64ToBytes(PUBLIC_KEY);

    // A subscription made under an older key pair can't receive anything
    // signed with the new one, and the browser refuses to subscribe over it.
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !sameBytes(subscription.options.applicationServerKey, key)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });

    const response = await post("/api/push/subscribe", {
      subscription: subscription.toJSON(),
      timezone: browserTimeZone(),
    });
    if (response.status === 503) {
      return { ok: false, state: "unconfigured", error: await errorFrom(response, "Push notifications aren't configured on this deployment.") };
    }
    if (!response.ok) return { ok: false, error: await errorFrom(response, "Couldn't save this device. Try again.") };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error && error.name === "AbortError"
          ? "The browser's push service didn't answer. Check your connection and try again."
          : "Couldn't turn notifications on for this device. Try again.",
    };
  }
}

/** Unsubscribes this browser and forgets it on the server. */
export async function disablePush(): Promise<Outcome> {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return { ok: true };
    const { endpoint } = subscription;
    await subscription.unsubscribe();
    const response = await post("/api/push/unsubscribe", { endpoint });
    if (!response.ok) return { ok: false, error: await errorFrom(response, "Couldn't update this device. Try again.") };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't turn notifications off for this device. Try again." };
  }
}

/** Asks the server to push a test notification to this device. */
export async function sendTestPush(): Promise<Outcome> {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return { ok: false, state: "off", error: "Notifications aren't on for this device yet." };
    const response = await post("/api/push/test", { endpoint: subscription.endpoint });
    if (response.status === 503) {
      return { ok: false, state: "unconfigured", error: await errorFrom(response, "Push notifications aren't configured on this deployment.") };
    }
    if (!response.ok) return { ok: false, error: await errorFrom(response, "The test didn't send. Try again.") };
    return { ok: true };
  } catch {
    return { ok: false, error: "The test didn't send. Check your connection and try again." };
  }
}
