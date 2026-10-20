"use client";

/**
 * Short tones and a buzz for timer events.
 *
 * Browsers only let a page make sound after a user gesture, and iOS also needs
 * the audio context created inside one. `primeAudio` is called from the taps
 * that start timers so that, ninety seconds later, the beep is allowed.
 */

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

export function primeAudio() {
  try {
    const ctx = audio();
    if (ctx?.state === "suspended") void ctx.resume();
  } catch {
    // No audio is a missing beep, not a broken workout.
  }
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** Two rising tones and a buzz: rest is over, or a hold reached its target. */
export function chime() {
  try {
    const ctx = audio();
    if (ctx) {
      const now = ctx.currentTime;
      tone(ctx, 880, now, 0.16);
      tone(ctx, 1320, now + 0.2, 0.22);
    }
  } catch {
    // Ignored on purpose — see primeAudio.
  }
  try {
    navigator.vibrate?.([180, 90, 180]);
  } catch {
    // Same.
  }
}
