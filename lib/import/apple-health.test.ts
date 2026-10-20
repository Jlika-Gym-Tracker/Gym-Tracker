import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { BodyMassScanner, pickHealthEntry, readHealthDate, scanHealthExport } from "./apple-health";

const record = (attrs: string) => `  <Record ${attrs}/>\n`;
const mass = (value: string, unit: string, start: string) =>
  record(
    `type="HKQuantityTypeIdentifierBodyMass" sourceName="Withings &amp; co" sourceVersion="5" unit="${unit}" ` +
      `creationDate="${start}" startDate="${start}" endDate="${start}" value="${value}"`,
  );

const EXPORT = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  "<HealthData locale=\"en_GB\">",
  record('type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="2024-01-01 08:00:00 +0000" value="1200"'),
  mass("82.4", "kg", "2024-01-01 07:10:00 +0000"),
  mass("82.0", "kg", "2024-01-01 21:30:00 +0000"),
  // Body mass index shares the prefix and must not be read as a weight.
  record('type="HKQuantityTypeIdentifierBodyMassIndex" unit="count" startDate="2024-01-02 07:00:00 +0000" value="24.1"'),
  mass("181.0", "lb", "2024-01-02 07:00:00 +0000"),
  mass("12.9", "st", "2024-01-03 07:00:00 +0000"),
  mass("9", "kg", "2024-01-04 07:00:00 +0000"),
  mass("80", "furlongs", "2024-01-05 07:00:00 +0000"),
  "</HealthData>",
].join("\n");

describe("BodyMassScanner", () => {
  it("keeps one weight per day — the last — converted to kg", () => {
    const scanner = new BodyMassScanner();
    scanner.push(EXPORT);
    const scan = scanner.finish();
    expect(scan.entries).toEqual([
      { date: "2024-01-01", weightKg: 82 },
      { date: "2024-01-02", weightKg: 82.1 },
      { date: "2024-01-03", weightKg: 81.92 },
    ]);
    expect(scan.records).toBe(6);
    expect(scan.outOfRange).toBe(1);
    expect(scan.unreadable).toBe(1);
  });

  it("gives the same answer however the text is cut into chunks", () => {
    for (const size of [1, 7, 40, 333]) {
      const scanner = new BodyMassScanner();
      for (let i = 0; i < EXPORT.length; i += size) scanner.push(EXPORT.slice(i, i + size));
      expect(scanner.finish().entries).toHaveLength(3);
    }
  });

  it("orders two weigh-ins on one day by the instant, not the text", () => {
    const scanner = new BodyMassScanner();
    scanner.push(mass("80", "kg", "2024-01-01 09:00:00 +0200") + mass("81", "kg", "2024-01-01 08:30:00 +0000"));
    // 09:00 at +02:00 is 07:00 UTC, before 08:30 UTC, so 81 is the later one.
    expect(scanner.finish().entries).toEqual([{ date: "2024-01-01", weightKg: 81 }]);
  });
});

describe("readHealthDate", () => {
  it("keeps the calendar day as written and the instant behind it", () => {
    expect(readHealthDate("2023-01-15 07:30:12 +0100")).toEqual({
      date: "2023-01-15",
      at: Date.UTC(2023, 0, 15, 6, 30, 12),
    });
    expect(readHealthDate("yesterday")).toBeNull();
  });
});

describe("pickHealthEntry", () => {
  const entry = (name: string, size: number) => ({
    name, method: 8, compressedSize: size, uncompressedSize: size, localHeaderOffset: 0,
  });

  it("takes export.xml over the clinical records", () => {
    expect(pickHealthEntry([entry("apple_health_export/export_cda.xml", 900), entry("apple_health_export/export.xml", 100)])?.name)
      .toBe("apple_health_export/export.xml");
  });

  it("falls back to the largest XML when the name is localised", () => {
    expect(pickHealthEntry([entry("apple_health_export/exportar_cda.xml", 900), entry("apple_health_export/exportar.xml", 500), entry("routes/a.gpx", 9999)])?.name)
      .toBe("apple_health_export/exportar.xml");
  });
});

describe("scanHealthExport", () => {
  it("reads export.xml straight from the zip Health makes", async () => {
    const zip = zipSync({
      "apple_health_export/export_cda.xml": strToU8("<ClinicalDocument/>"),
      "apple_health_export/export.xml": strToU8(EXPORT.repeat(50)),
      "apple_health_export/workout-routes/route_1.gpx": strToU8("<gpx/>"),
    });
    const fractions: number[] = [];
    const scan = await scanHealthExport(new Blob([zip]), (f) => fractions.push(f));
    expect(scan.entries).toHaveLength(3);
    expect(fractions.at(-1)).toBe(1);
  });

  it("reads a bare export.xml too", async () => {
    const scan = await scanHealthExport(new Blob([EXPORT]));
    expect(scan.entries.map((e) => e.date)).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
  });

  it("says so when a zip has no Health export in it", async () => {
    const zip = zipSync({ "photo.jpg": new Uint8Array([1, 2, 3]) });
    await expect(scanHealthExport(new Blob([zip]))).rejects.toThrow(/no export\.xml/);
  });
});
