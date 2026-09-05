/**
 * The Sunday review email.
 *
 * Composition is a pure function so the copy can be tested without sending
 * anything, and so a week with nothing in it produces an honest email rather
 * than a cheerful one about zero sessions.
 */

export type WeeklyReview = {
  displayName: string;
  sessionsDone: number;
  sessionsPlanned: number;
  setsCompleted: number;
  volumeKg: number;
  weightChangeKg: number | null;
  nextWeekPublished: boolean;
};

export type ComposedEmail = { subject: string; text: string; html: string };

function summarise(review: WeeklyReview): string {
  if (review.sessionsPlanned === 0 && review.sessionsDone === 0) {
    return "No week was written and nothing was logged. Start by writing next week.";
  }
  if (review.sessionsDone === 0) {
    return `You planned ${review.sessionsPlanned} sessions and logged none. It happens — write next week and start again.`;
  }
  if (review.sessionsDone >= review.sessionsPlanned && review.sessionsPlanned > 0) {
    return `Every planned session done — ${review.sessionsDone} of ${review.sessionsPlanned}.`;
  }
  return `${review.sessionsDone} of ${review.sessionsPlanned} planned sessions done.`;
}

export function composeWeeklyReview(review: WeeklyReview): ComposedEmail {
  const lines = [
    summarise(review),
    `${review.setsCompleted} sets · ${Math.round(review.volumeKg).toLocaleString()} kg moved.`,
  ];

  if (review.weightChangeKg != null) {
    const direction = review.weightChangeKg < 0 ? "down" : "up";
    lines.push(
      `Bodyweight ${direction} ${Math.abs(review.weightChangeKg).toFixed(1)} kg on a seven-day average.`,
    );
  } else {
    lines.push("No weigh-ins this week — one a week is enough to see the trend.");
  }

  lines.push(
    review.nextWeekPublished
      ? "Next week is already published. Nothing to do but show up."
      : "Next week is not written yet. That is the one thing to do today.",
  );

  const subject = review.sessionsDone > 0
    ? `${review.sessionsDone} sessions, ${Math.round(review.volumeKg).toLocaleString()} kg — your week`
    : "Your week in JLIKA Gym";

  const text = `${review.displayName},\n\n${lines.join("\n\n")}\n\n— JLIKA Gym`;

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;background:#08090a;color:#f2f4f2;padding:28px;border-radius:16px;max-width:520px">
  <div style="font-size:11px;letter-spacing:.12em;color:#c9f24d;text-transform:uppercase;font-weight:700">Your week</div>
  <h1 style="font-size:24px;margin:12px 0 18px;letter-spacing:-.02em">${escapeHtml(review.displayName)},</h1>
  ${lines.map((line) => `<p style="font-size:14px;line-height:1.6;color:#98a29c;margin:0 0 14px">${escapeHtml(line)}</p>`).join("")}
  <p style="font-size:12px;color:#5d6763;margin-top:22px">JLIKA Gym</p>
</div>`;

  return { subject, text, html };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
