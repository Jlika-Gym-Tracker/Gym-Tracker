import "server-only";
import webpush, { WebPushError } from "web-push";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database, PushSubscriptionRow } from "@/lib/database.types";

/**
 * Sending web push, server side.
 *
 * Push needs the VAPID key pair and subject from the environment, and the
 * service key: alerts are sent after the request that scheduled them has
 * ended (the rest timer) or with no request at all (the hourly reminder), so
 * there is no signed-in session to read subscriptions with. Without any of
 * them push is simply off, and every caller says so instead of failing.
 */

export type PushConfig = {
  vapid: { publicKey: string; privateKey: string; subject: string };
  serviceKey: string;
};

export function pushConfig(): PushConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  const serviceKey = process.env.SUPABASE_SECRET_KEY?.trim();
  // web-push refuses a subject that isn't a mailto: or https: URL, and would
  // throw on every send; better to read that as "not configured".
  if (!publicKey || !privateKey || !serviceKey || !subject || !/^(mailto:|https:)/.test(subject)) {
    return null;
  }
  return { vapid: { publicKey, privateKey, subject }, serviceKey };
}

export const NOT_CONFIGURED = "Push notifications aren't configured on this deployment.";

/** Reads and writes past RLS. Only ever for the user ids a caller has already settled on. */
export function adminClient(config: PushConfig) {
  return createAdminClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, config.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * What the service worker shows. `url` is a path in this app; `tag` collapses
 * repeats; `always` shows it even over the open app, which otherwise stays
 * quiet because the page makes its own sound.
 */
export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  always?: boolean;
};

export type Deliverable = Pick<PushSubscriptionRow, "id" | "endpoint" | "p256dh" | "auth">;

export type SendOptions = {
  /** Seconds the push service may hold it for an offline device. Late is often useless. */
  ttl: number;
  urgency: "low" | "normal" | "high";
  /** Same topic replaces an undelivered earlier message instead of queueing behind it. */
  topic?: string;
};

/**
 * Sends one payload to each subscription. A push service answering 404 or 410
 * is saying the subscription is gone for good — the browser unsubscribed, or
 * the site's permission was revoked — so those ids come back in `gone` for the
 * caller to delete. Anything else is a passing failure and is only counted.
 */
export async function sendPush(
  config: PushConfig,
  subscriptions: Deliverable[],
  payload: PushPayload,
  options: SendOptions,
): Promise<{ sent: number; failed: number; gone: string[] }> {
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subscriptions.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
        vapidDetails: config.vapid,
        TTL: options.ttl,
        urgency: options.urgency,
        topic: options.topic,
        contentEncoding: "aes128gcm",
        timeout: 10_000,
      }),
    ),
  );

  const gone: string[] = [];
  let sent = 0;
  let failed = 0;
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      sent++;
      return;
    }
    const error = result.reason;
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
      gone.push(subscriptions[i]!.id);
    } else {
      failed++;
    }
  });
  return { sent, failed, gone };
}

export const REST_PAYLOAD = {
  title: "Rest's over",
  body: "Time for your next set.",
  tag: "rest-timer",
};

/**
 * Sends a pending rest alert if it is still the current one.
 *
 * The delete is the check: it removes the row only while it still carries this
 * token, and only the call that removes it sends. A rest restarted since then
 * has rewritten the token; a skipped one has deleted the row. Either way this
 * finds nothing and stays quiet.
 */
export async function deliverRestAlert(config: PushConfig, userId: string, token: string): Promise<void> {
  const admin = adminClient(config);
  const { data: claimed } = await admin
    .from("rest_alerts")
    .delete()
    .eq("user_id", userId)
    .eq("token", token)
    .select("endpoint, url");
  const alert = claimed?.[0];
  if (!alert) return;

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("endpoint", alert.endpoint);
  if (!subscriptions?.length) return;

  const { gone } = await sendPush(config, subscriptions, { ...REST_PAYLOAD, url: alert.url }, {
    // A rest alert a minute late is noise, not help.
    ttl: 60,
    urgency: "high",
    topic: "rest-timer",
  });
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
}
