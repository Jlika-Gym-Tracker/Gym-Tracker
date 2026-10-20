/**
 * Rest-timer alerts that still arrive when the app is in the background.
 *
 * The session screen calls these whenever a rest starts, changes length, or is
 * skipped. They must never throw and never block the UI: an alert that fails to
 * schedule is a missed beep, not a broken workout. So both return at once and
 * do their work on a queue, swallowing every failure.
 *
 * They cost nothing on a device without push: that is checked locally
 * (permission, then the browser's own subscription) before any request. When
 * the server answers that rest alerts are off, or that this device isn't
 * subscribed after all, the calls go quiet for a few minutes rather than
 * asking again on every set.
 *
 * Requests go out in the order they were made, so "schedule, then cancel"
 * always lands as a cancel. The server keeps one pending alert per person and
 * sends it only if nothing has replaced or cancelled it by the time it is due.
 */

/** Rest never runs longer than this; the server caps its wait to match. */
const MAX_REST_MS = 10 * 60_000;
/** How long to stop asking after the server says no. */
const QUIET_MS = 5 * 60_000;
/** How long a looked-up subscription is trusted before asking the browser again. */
const ENDPOINT_TTL_MS = 60_000;
/** Survives a reload, so a rest skipped after one still cancels what was scheduled before it. */
const PENDING_KEY = "jlika.rest-alert-until";

let queue: Promise<void> = Promise.resolve();
let generation = 0;
let quietUntil = 0;
let endpointCache: { value: string | null; at: number } | null = null;
let pendingInMemory = 0;
/** Schedules queued or on the wire whose answer hasn't come back yet. */
let outstanding = 0;

/** Schedule (or reschedule) the alert for when the current rest ends. */
export function scheduleRestAlert(endsAtMs: number): void {
  try {
    if (!Number.isFinite(endsAtMs) || !mightPush()) return;
    if (endsAtMs <= Date.now()) {
      // A rest that has already ended replaces the pending alert with nothing.
      cancelRestAlert();
      return;
    }
    const id = ++generation;
    outstanding++;
    enqueue(async () => {
      try {
        await sendSchedule(id, endsAtMs);
      } finally {
        outstanding--;
      }
    });
  } catch {
    // Never let an alert break the workout.
  }
}

/** The rest was skipped or the session ended: drop any pending alert. */
export function cancelRestAlert(): void {
  try {
    generation++;
    // Nothing scheduled from this tab and nothing on its way: no request.
    if (getPending() <= Date.now() && outstanding === 0) return;
    setPending(0);
    enqueue(async () => {
      await fetch("/api/push/rest", { method: "DELETE", keepalive: true });
    });
  } catch {
    // As above.
  }
}

/**
 * Forget what the last answers said — call after the lifter changes their
 * notification settings, so a rest started a moment later is not held back by
 * a "no" from before the change.
 */
export function resetRestAlerts(): void {
  quietUntil = 0;
  endpointCache = null;
}

async function sendSchedule(id: number, endsAtMs: number) {
  // Something newer was asked for while this waited its turn.
  if (id !== generation) return;
  const endpoint = await deviceEndpoint();
  if (!endpoint) return;

  const delayMs = Math.min(endsAtMs - Date.now(), MAX_REST_MS);
  if (delayMs <= 0) return;
  // The delay, not the end time, crosses the wire: the phone's clock and the
  // server's rarely agree to the second, and a rest is measured in them.
  const response = await fetch("/api/push/rest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ delayMs, endpoint, url: location.pathname }),
    keepalive: true,
  });
  if (!response.ok) return;
  const { status } = (await response.json()) as { status?: string };
  if (status === "scheduled") {
    // A cancel that arrived while this was on the wire is already queued
    // behind it; don't mark as pending what that cancel is about to remove.
    if (id === generation) setPending(Date.now() + delayMs);
  } else {
    // "off", "no-subscription" or "not-configured": nothing to send to.
    quietUntil = Date.now() + QUIET_MS;
    endpointCache = null;
  }
}

/** Synchronous and free: is push even possible on this device right now? */
function mightPush(): boolean {
  return (
    typeof window !== "undefined" &&
    Date.now() >= quietUntil &&
    "serviceWorker" in navigator &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  );
}

function enqueue(task: () => Promise<void>) {
  queue = queue.then(task).catch(() => {});
}

/** This browser's push endpoint, looked up locally (no network) and cached briefly. */
async function deviceEndpoint(): Promise<string | null> {
  if (endpointCache && Date.now() - endpointCache.at < ENDPOINT_TTL_MS) return endpointCache.value;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  const value = subscription?.endpoint ?? null;
  endpointCache = { value, at: Date.now() };
  if (!value) quietUntil = Date.now() + QUIET_MS;
  return value;
}

function getPending(): number {
  try {
    return Math.max(pendingInMemory, Number(sessionStorage.getItem(PENDING_KEY)) || 0);
  } catch {
    return pendingInMemory;
  }
}

function setPending(until: number) {
  pendingInMemory = until;
  try {
    if (until) sessionStorage.setItem(PENDING_KEY, String(until));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Private mode without storage: the in-memory copy is enough within this page.
  }
}
