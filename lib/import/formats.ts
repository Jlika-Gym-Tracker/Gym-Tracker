import type { ImportFormat } from "./types";
import type { WeightUnit } from "./values";

/**
 * Which app wrote a file, and where each thing lives in it — read from the
 * header row, never from column positions, because every app (and every
 * version of Strong) orders them differently.
 *
 * The exports this knows, header rows as the apps write them:
 *
 *   Strong (classic)  Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,
 *                     Distance,Seconds,Notes,Workout Notes,RPE
 *                     Weight and Distance follow the app's unit setting and say
 *                     nothing about it, so the review step asks.
 *   Strong (older)    Date;Workout Name;Exercise Name;Set Order;Weight;Weight Unit;Reps;
 *                     RPE;Distance;Distance Unit;Seconds;Notes;Workout Notes;Workout Duration
 *   Strong (2024+)    "Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";
 *                     "Set Order";"Weight (kg)";"Reps";"RPE";"Distance (meters)";"Seconds";
 *                     "Notes";"Workout Notes"
 *   Hevy              title,start_time,end_time,description,exercise_title,superset_id,
 *                     exercise_notes,set_index,set_type,weight_kg|weight_lbs,reps,
 *                     distance_km|distance_miles,duration_seconds,rpe
 *   FitNotes Android  Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,
 *                     Distance Unit,Time,Comment   (older builds: "Weight (kgs)")
 *   FitNotes iOS      Date,Exercise,Category,Weight (kg),Weight (lbs),Reps,Distance,
 *                     Distance Unit,Time,Notes,Kind
 */

/** "Weight (kg)" → "weight (kg)", "start_time" → "start time". */
export function headerKey(raw: string): string {
  return raw.replace(/^﻿/, "").trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

export function detectFormat(header: string[]): ImportFormat | null {
  const keys = new Set(header.map(headerKey));
  if (keys.has("exercise title") && keys.has("start time")) return "hevy";
  if (keys.has("exercise name") && keys.has("set order")) return "strong";
  if (keys.has("exercise") && keys.has("date")) {
    const iosWeights = keys.has("weight (kg)") && keys.has("weight (lbs)");
    return keys.has("kind") || iosWeights ? "fitnotes-ios" : "fitnotes-android";
  }
  return null;
}

/** A weight column and what unit its numbers are in. "column" = read the Weight Unit cell. */
export type WeightColumn = { index: number; unit: WeightUnit | "column" | "unstated" };
/** A distance column and how many metres one of its numbers is. */
export type DistanceColumn = { index: number; metres: number | "column" | "unstated" };

export type Columns = {
  date?: number;
  start?: number;
  end?: number;
  workoutNumber?: number;
  title?: number;
  workoutNotes?: number;
  /** Workout length: text like "1h 5m", or plain seconds. */
  duration?: number;
  exercise?: number;
  category?: number;
  /** Strong's Set Order: 1, 2, 3 — or W for a warm-up, or a Rest Timer / Note row. */
  setOrder?: number;
  /** Hevy's set_type, FitNotes iOS's Kind. */
  setType?: number;
  /** In order of preference: an explicit kg column beats an explicit lb one beats a bare one. */
  weights: WeightColumn[];
  weightUnit?: number;
  reps?: number;
  rpe?: number;
  distances: DistanceColumn[];
  distanceUnit?: number;
  /** Per-set duration: Strong's Seconds, Hevy's duration_seconds, FitNotes' Time. */
  seconds?: number;
};

const WEIGHT_HEADERS: [string, WeightUnit][] = [
  ["weight kg", "kg"], ["weight (kg)", "kg"], ["weight (kgs)", "kg"],
  ["weight lbs", "lb"], ["weight lb", "lb"], ["weight (lbs)", "lb"], ["weight (lb)", "lb"],
];

const DISTANCE_HEADERS: [string, number][] = [
  ["distance (meters)", 1], ["distance (metres)", 1], ["distance (m)", 1], ["distance m", 1],
  ["distance km", 1000], ["distance (km)", 1000],
  ["distance miles", 1609.344], ["distance (miles)", 1609.344], ["distance (mi)", 1609.344],
];

export function resolveColumns(header: string[]): Columns {
  const keys = header.map(headerKey);
  const find = (...names: string[]) => {
    for (const name of names) {
      const i = keys.indexOf(name);
      if (i !== -1) return i;
    }
    return undefined;
  };

  const weightUnit = find("weight unit");
  const distanceUnit = find("distance unit");

  const weights: WeightColumn[] = [];
  for (const unit of ["kg", "lb"] as const) {
    for (const [name, u] of WEIGHT_HEADERS) {
      const i = keys.indexOf(name);
      if (u === unit && i !== -1) weights.push({ index: i, unit });
    }
  }
  const bareWeight = find("weight");
  if (bareWeight !== undefined) {
    weights.push({ index: bareWeight, unit: weightUnit !== undefined ? "column" : "unstated" });
  }

  const distances: DistanceColumn[] = [];
  for (const [name, metres] of DISTANCE_HEADERS) {
    const i = keys.indexOf(name);
    if (i !== -1) distances.push({ index: i, metres });
  }
  const bareDistance = find("distance");
  if (bareDistance !== undefined) {
    distances.push({ index: bareDistance, metres: distanceUnit !== undefined ? "column" : "unstated" });
  }

  return {
    date: find("date"),
    start: find("start time"),
    end: find("end time"),
    workoutNumber: find("workout #"),
    title: find("workout name", "title"),
    workoutNotes: find("workout notes", "description"),
    duration: find("duration (sec)", "duration", "workout duration"),
    exercise: find("exercise name", "exercise title", "exercise"),
    category: find("category"),
    setOrder: find("set order"),
    setType: find("set type", "kind"),
    weights,
    weightUnit,
    reps: find("reps"),
    rpe: find("rpe"),
    distances,
    distanceUnit,
    seconds: find("seconds", "duration seconds", "time"),
  };
}

/**
 * What kind of row this is. The rule, kept deliberately narrow: a set is only
 * skipped as a warm-up when the file itself marks it as one —
 *
 *   Strong        Set Order "W"
 *   Hevy          set_type "warmup"
 *   FitNotes iOS  a Kind mentioning warm-up
 *
 * FitNotes on Android has no such marker, so every one of its sets imports.
 * Drop sets and failure sets are working sets and always import. Strong also
 * writes rows for rest timers and exercise notes, which are not sets at all.
 */
export function classifyRow(setOrder: string, setType: string): "set" | "warmup" | "not-a-set" {
  const order = setOrder.trim().toLowerCase();
  if (order) {
    if (/^rest|^note/.test(order)) return "not-a-set";
    if (order === "w" || order.startsWith("warm")) return "warmup";
  }
  if (/warm/.test(setType.trim().toLowerCase())) return "warmup";
  return "set";
}
