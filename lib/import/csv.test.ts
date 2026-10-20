import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("reads plain rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("keeps a comma inside quotes in one cell", () => {
    expect(parseCsv('Exercise,Reps\n"Bench Press, Close Grip",8')).toEqual([
      ["Exercise", "Reps"],
      ["Bench Press, Close Grip", "8"],
    ]);
  });

  it("keeps a line break inside quotes in one cell", () => {
    const rows = parseCsv('Date,Notes\n2024-01-01,"felt heavy\nleft knee sore"\n2024-01-02,ok');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(["2024-01-01", "felt heavy\nleft knee sore"]);
    expect(rows[2]).toEqual(["2024-01-02", "ok"]);
  });

  it("reads a doubled quote as one quote", () => {
    expect(parseCsv('Name\n"The ""Big"" Three"')[1]).toEqual(['The "Big" Three']);
  });

  it("drops a byte-order mark so the first header still matches", () => {
    expect(parseCsv("﻿Date,Exercise\n2024-01-01,Squat")[0]).toEqual(["Date", "Exercise"]);
  });

  it("handles CRLF and bare CR line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a,b\r1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("skips blank lines but keeps empty cells", () => {
    expect(parseCsv("a,b\n\n1,\n")).toEqual([["a", "b"], ["1", ""]]);
  });

  it("reads Strong's semicolon export, every field quoted", () => {
    const text = '"Workout #";"Date";"Exercise Name"\n"1";"2025-04-29 12:00:00";"Bench Press (Barbell)"';
    expect(parseCsv(text)).toEqual([
      ["Workout #", "Date", "Exercise Name"],
      ["1", "2025-04-29 12:00:00", "Bench Press (Barbell)"],
    ]);
  });

  it("does not lose the row when a quote is never closed", () => {
    expect(parseCsv('a,b\n1,"oops')).toEqual([["a", "b"], ["1", "oops"]]);
  });
});

describe("detectDelimiter", () => {
  it("picks whatever the header row uses most, ignoring quoted text", () => {
    expect(detectDelimiter("Date,Exercise,Reps")).toBe(",");
    expect(detectDelimiter('"Date";"Exercise";"Notes, mostly"')).toBe(";");
    expect(detectDelimiter("Date\tExercise\tReps")).toBe("\t");
  });
});
