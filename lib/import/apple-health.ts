import type { BodyWeightEntry } from "./types";
import { blobSource, isZip, listZipEntries, streamZipEntry, type ZipEntry } from "./zip";

/**
 * Body weight out of an Apple Health export.
 *
 * export.xml is one enormous document — often hundreds of megabytes — and body
 * mass is a few hundred of its millions of records. Building a DOM would take
 * the tab down, so this scans the text a chunk at a time for the one record
 * type it wants and never holds more than a chunk plus a few kilobytes.
 */

// The closing quote matters: without it this would also match BodyMassIndex.
const NEEDLE = 'type="HKQuantityTypeIdentifierBodyMass"';
// Longer than any <Record …> opening tag, so a tag split across two chunks is
// always still whole once the next chunk is appended.
const KEEP = 8192;

/** Kilograms per one of each unit Health writes body mass in. */
const KG_PER: Record<string, number> = {
  kg: 1,
  g: 0.001,
  lb: 0.45359237,
  lbs: 0.45359237,
  st: 6.35029318,
};

export type BodyMassScan = {
  /** One per day, the last weigh-in of that day, oldest first. */
  entries: BodyWeightEntry[];
  /** Body-mass records seen in the file, before keeping one per day. */
  records: number;
  /** Values outside 20–400 kg: a typo, or someone else's scale. */
  outOfRange: number;
  /** Records with a unit or date we couldn't read. */
  unreadable: number;
};

export class BodyMassScanner {
  private buffer = "";
  private latest = new Map<string, { kg: number; at: number }>();
  private records = 0;
  private outOfRange = 0;
  private unreadable = 0;

  push(chunk: string): void {
    const text = this.buffer + chunk;
    let consumed = 0;
    let pendingStart = -1;
    let from = 0;

    for (;;) {
      const hit = text.indexOf(NEEDLE, from);
      if (hit === -1) break;
      const start = text.lastIndexOf("<", hit);
      const end = tagEnd(text, hit + NEEDLE.length);
      if (end === -1) {
        // The rest of this tag is in the next chunk.
        pendingStart = start;
        break;
      }
      if (start >= consumed && text.startsWith("<Record", start)) {
        this.read(text.slice(start, end + 1));
      }
      consumed = end + 1;
      from = consumed;
    }

    const keepFrom = pendingStart !== -1 ? pendingStart : Math.max(consumed, text.length - KEEP);
    this.buffer = text.slice(keepFrom);
  }

  finish(): BodyMassScan {
    this.push("");
    const entries = [...this.latest.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { kg }]) => ({ date, weightKg: Math.round(kg * 100) / 100 }));
    return {
      entries,
      records: this.records,
      outOfRange: this.outOfRange,
      unreadable: this.unreadable,
    };
  }

  private read(tag: string) {
    this.records++;
    const attributes = new Map<string, string>();
    for (const m of tag.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) attributes.set(m[1]!, m[2]!);

    const factor = KG_PER[(attributes.get("unit") ?? "").toLowerCase()];
    const value = Number(attributes.get("value"));
    const when = readHealthDate(attributes.get("startDate") ?? attributes.get("creationDate") ?? "");
    if (!factor || !Number.isFinite(value) || !when) {
      this.unreadable++;
      return;
    }

    const kg = value * factor;
    // body_metrics accepts under 400 kg; under 20 is a child's scale or a typo.
    if (!(kg > 20 && kg < 400)) {
      this.outOfRange++;
      return;
    }

    // The last weigh-in of a day wins: a morning reading followed by an
    // evening one keeps the evening's, same as weighing twice in the app.
    const previous = this.latest.get(when.date);
    if (!previous || when.at >= previous.at) this.latest.set(when.date, { kg, at: when.at });
  }
}

/** First `>` after `from` that is not inside a quoted attribute value. */
function tagEnd(text: string, from: number): number {
  let quoted = false;
  for (let i = from; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 34) quoted = !quoted;
    else if (c === 62 && !quoted) return i;
  }
  return -1;
}

/**
 * "2023-01-15 07:30:12 +0100" → the calendar day as written (the day Health
 * shows it under) and the instant, to order two weigh-ins on the same day.
 */
export function readHealthDate(raw: string): { date: string; at: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\s*([+-])(\d{2}):?(\d{2}))?/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, sign, oh, om] = m;
  const offset = sign ? (sign === "-" ? -1 : 1) * (Number(oh) * 60 + Number(om)) : 0;
  const at = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!) - offset * 60_000;
  return { date: `${y}-${mo}-${d}`, at };
}

/**
 * The export inside export.zip. Its name follows the phone's language on some
 * versions ("Export.xml", "exportar.xml"), so failing an exact match this takes
 * the largest XML file that isn't the clinical-records one.
 */
export function pickHealthEntry(entries: ZipEntry[]): ZipEntry | null {
  const exact = entries.find((e) => /(^|\/)export\.xml$/i.test(e.name));
  if (exact) return exact;
  const xml = entries
    .filter((e) => /\.xml$/i.test(e.name) && !/cda/i.test(e.name))
    .sort((a, b) => b.uncompressedSize - a.uncompressedSize);
  return xml[0] ?? null;
}

/** Let the browser paint the progress bar between chunks. */
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Scans an export.xml or the export.zip around it. `onProgress` gets 0–1 as
 * the file is read.
 */
export async function scanHealthExport(
  file: Blob,
  onProgress: (fraction: number) => void = () => {},
): Promise<BodyMassScan> {
  const source = blobSource(file);
  const scanner = new BodyMassScanner();
  const decoder = new TextDecoder();

  if (await isZip(source)) {
    const entry = pickHealthEntry(await listZipEntries(source));
    if (!entry) throw new Error("That zip has no export.xml in it. Is it the file Health → Export All Health Data made?");
    await streamZipEntry(source, entry, async (bytes, fraction) => {
      scanner.push(decoder.decode(bytes, { stream: true }));
      onProgress(fraction);
      await yieldToBrowser();
    });
  } else {
    const step = 8 * 1024 * 1024;
    for (let at = 0; at < source.size; at += step) {
      const end = Math.min(at + step, source.size);
      scanner.push(decoder.decode(await source.read(at, end), { stream: end < source.size }));
      onProgress(end / source.size);
      await yieldToBrowser();
    }
  }
  scanner.push(decoder.decode());
  return scanner.finish();
}
