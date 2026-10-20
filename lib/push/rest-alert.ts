/**
 * Rest-timer alerts that still arrive when the app is in the background.
 *
 * The session screen calls these whenever a rest starts, changes length, or is
 * skipped. They must never throw and never block the UI: an alert that fails to
 * schedule is a missed beep, not a broken workout.
 *
 * Placeholder until web push lands — both are no-ops.
 */

/** Schedule (or reschedule) the alert for when the current rest ends. */
export function scheduleRestAlert(endsAtMs: number): void {
  void endsAtMs;
}

/** The rest was skipped or the session ended: drop any pending alert. */
export function cancelRestAlert(): void {}
