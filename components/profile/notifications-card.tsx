"use client";

import { useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { saveWorkoutReminder, toggleSetting } from "@/app/actions/profile";
import type { UserSettings } from "@/lib/database.types";
import {
  browserTimeZone, disablePush, enablePush, readPushState, sendTestPush, type PushState,
} from "@/lib/push/client";
import { resetRestAlerts } from "@/lib/push/rest-alert";
import { useAction } from "@/lib/use-action";
import { Card } from "@/components/kit/card";
import { cn } from "@/lib/utils";
import { Message, Toggle } from "./controls";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Profile → Data & privacy → Notifications: push for this device, rest-timer
 * alerts, and the workout-day reminder.
 *
 * The device part is per browser (each one subscribes on its own); the toggles
 * below it are per account and apply to every device that has subscribed.
 */
export function NotificationsCard({ settings }: { settings: UserSettings }) {
  const [device, setDevice] = useState<PushState | "checking">("checking");
  const [message, setMessage] = useState<{ error?: string; notice?: string }>({});
  const [hour, setHour] = useState(settings.reminder_hour ?? 18);
  // Read after mount: the server has no idea which zone this browser is in.
  const [zone, setZone] = useState<string | null>(null);
  const hourAction = useAction({ announce: "soft" });
  const zoneAction = useAction({ announce: "soft" });

  useEffect(() => {
    let live = true;
    readPushState()
      .then((state) => live && setDevice(state))
      .catch(() => live && setDevice("unsupported"));
    setZone(browserTimeZone());
    return () => {
      live = false;
    };
  }, []);

  const configured = device !== "unconfigured";
  const savedZone = settings.timezone ?? "UTC";

  return (
    <Card>
      <h2 className="mb-1 text-[15px] font-bold">Notifications</h2>
      <p className="mb-3 text-[12.5px] leading-[1.5] text-fg-soft">
        A buzz when rest is over with JLIKA in the background, and a nudge on training days.
      </p>

      <DeviceStatus
        state={device}
        onChange={(next, result) => {
          setDevice(next);
          setMessage(result);
          resetRestAlerts();
        }}
      />

      {message.error || message.notice ? (
        <div className="mt-3">
          <Message error={message.error} notice={message.notice} />
        </div>
      ) : null}

      <div className="mt-2">
        <Toggle
          label="Rest-timer alerts"
          description="When rest runs out and you've switched away, this device buzzes. With JLIKA open in front, you'll hear the usual beep instead."
          checked={settings.rest_push ?? true}
          disabled={!configured}
          onChange={async (value) => {
            const result = await toggleSetting("rest_push", value);
            resetRestAlerts();
            return result;
          }}
        />
        <Toggle
          label="Workout-day reminder"
          description="On a training day of your published week, if you haven't started a session by then."
          checked={settings.notify_workout_day ?? false}
          disabled={!configured}
          onChange={(value) => saveWorkoutReminder({ enabled: value, timezone: browserTimeZone() })}
        />

        {settings.notify_workout_day && configured ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-2.5 pl-[52px]">
            <label className="flex items-center gap-2 text-[12.5px] text-fg-soft">
              Remind me at
              <span className="relative">
                <select
                  value={hour}
                  disabled={hourAction.pending}
                  aria-busy={hourAction.pending || undefined}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setHour(next);
                    hourAction.run(() => saveWorkoutReminder({ hour: next, timezone: browserTimeZone() }));
                  }}
                  className="rounded-[10px] border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-[12.5px] text-fg-2 outline-none focus:border-line-hi disabled:opacity-60"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
                {hourAction.pending ? (
                  <Loader2 className="absolute top-1/2 -right-5 size-3.5 -translate-y-1/2 animate-spin text-fg-dim" aria-label="Saving" />
                ) : null}
              </span>
            </label>
            <p className="w-full text-[11.5px] leading-[1.5] text-fg-dim">
              In {savedZone.replace(/_/g, " ")} time.
              {zone && zone !== savedZone ? (
                <>
                  {" "}This device is on {zone.replace(/_/g, " ")}.{" "}
                  <button
                    type="button"
                    disabled={zoneAction.pending}
                    onClick={() => zoneAction.run(() => saveWorkoutReminder({ timezone: zone }))}
                    className="inline-flex items-center gap-1 font-semibold text-accent hover:underline disabled:opacity-60"
                  >
                    {zoneAction.pending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                    Use that instead
                  </button>
                </>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function DeviceStatus({
  state,
  onChange,
}: {
  state: PushState | "checking";
  onChange: (next: PushState, message: { error?: string; notice?: string }) => void;
}) {
  const turnOn = useAction({ announce: "soft", label: "Turning on" });
  const turnOff = useAction({ announce: "soft", label: "Turning off" });
  const test = useAction({ announce: "soft", label: "Sending" });
  const busy = turnOn.pending || turnOff.pending || test.pending;

  const box = (tone: "dim" | "warn", text: string) => (
    <p
      className={cn(
        "rounded-[11px] border px-3.5 py-2.5 text-[12.5px] leading-[1.5]",
        tone === "warn" ? "border-warn/40 bg-warn-soft/40 text-fg-2" : "border-line bg-surface-2 text-fg-soft",
      )}
    >
      {text}
    </p>
  );

  switch (state) {
    case "checking":
      return <p className="font-mono text-[11px] text-fg-dim uppercase">Checking this device…</p>;
    case "unconfigured":
      return box("dim", "Push notifications aren't configured on this deployment, so there's nothing to turn on here yet.");
    case "unsupported":
      return box("warn", "This browser can't receive push notifications. Recent Chrome, Edge, Firefox and Safari can.");
    case "ios-install":
      return box(
        "warn",
        "On iPhone and iPad, notifications only reach JLIKA from the Home Screen. In Safari, tap Share → Add to Home Screen, open JLIKA from there, and turn them on.",
      );
    case "denied":
      return box(
        "warn",
        "Notifications are blocked for this site. Allow them in your browser's site settings, then reload this page.",
      );
    case "off":
      return (
        <DeviceButton
          pending={turnOn.pending}
          disabled={busy}
          primary
          onClick={() =>
            turnOn.run(async () => {
              const result = await enablePush();
              if (result.ok) onChange("on", { notice: "Notifications are on for this device." });
              else onChange(result.state ?? "off", { error: result.error });
            })
          }
        >
          <BellRing className="size-3.5" strokeWidth={2.2} />
          Turn on for this device
        </DeviceButton>
      );
    case "on":
      return (
        <div className="flex flex-col gap-2.5">
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-accent">
            <BellRing className="size-3.5" strokeWidth={2.2} />
            On for this device
          </p>
          <div className="flex flex-wrap gap-2">
            <DeviceButton
              pending={test.pending}
              disabled={busy}
              onClick={() =>
                test.run(async () => {
                  const result = await sendTestPush();
                  if (result.ok) onChange("on", { notice: "Sent — it should arrive in a few seconds." });
                  else onChange(result.state ?? "on", { error: result.error });
                })
              }
            >
              Send a test
            </DeviceButton>
            <DeviceButton
              pending={turnOff.pending}
              disabled={busy}
              onClick={() =>
                turnOff.run(async () => {
                  const result = await disablePush();
                  if (result.ok) onChange("off", { notice: "Notifications are off for this device." });
                  else onChange("on", { error: result.error });
                })
              }
            >
              Turn off for this device
            </DeviceButton>
          </div>
        </div>
      );
  }
}

/** Spins and disables while its request runs, like the kit's AsyncButton. */
function DeviceButton({
  pending,
  disabled,
  primary = false,
  onClick,
  children,
}: {
  pending: boolean;
  disabled: boolean;
  primary?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={pending || undefined}
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-[11px] px-4 py-3 text-[13px] disabled:opacity-60",
        primary
          ? "bg-accent font-bold text-[#0a0c0d] hover:bg-accent-hi"
          : "border border-stroke bg-ghost font-semibold text-fg-2 hover:bg-hover",
        pending && "cursor-progress",
      )}
    >
      {pending ? <Loader2 className="size-3.5 flex-none animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
