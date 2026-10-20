/**
 * A CSV reader that survives real exports.
 *
 * Splitting lines on commas works until the first exercise called "Bench Press,
 * Close Grip" or a workout note with a line break in it — and then every column
 * after it shifts by one, so a whole history imports wrong without a single
 * error. This handles quoted fields, doubled quotes, delimiters and newlines
 * inside quotes, a byte-order mark, and CRLF, LF or bare CR line endings.
 */

const QUOTE = 34; // "
const LF = 10;
const CR = 13;

export type Delimiter = "," | ";" | "\t";

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Strong's newer export separates with semicolons, everything else with commas.
 * The header row decides: whichever separator it uses most, outside quotes.
 */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') quoted = !quoted;
    else if (!quoted) {
      if (c === "\n" || c === "\r") break;
      if (c === "," || c === ";" || c === "\t") counts[c]++;
    }
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

/**
 * Parses the whole text into rows of cells. Blank lines are dropped; cells are
 * returned untrimmed so the caller decides what whitespace means.
 */
export function parseCsv(input: string, delimiter?: Delimiter): string[][] {
  const text = stripBom(input);
  const delim = (delimiter ?? detectDelimiter(text)).charCodeAt(0);
  const n = text.length;
  const rows: string[][] = [];
  let pos = 0;

  const endsField = (code: number) => code === delim || code === LF || code === CR;

  while (pos <= n) {
    const row: string[] = [];

    for (;;) {
      let value: string;
      if (text.charCodeAt(pos) === QUOTE) {
        // Quoted: everything up to the closing quote is literal, "" is one quote.
        let start = pos + 1;
        value = "";
        for (;;) {
          const close = text.indexOf('"', start);
          if (close === -1) {
            // Unterminated quote. Take the rest rather than losing the row.
            value += text.slice(start);
            pos = n;
            break;
          }
          value += text.slice(start, close);
          if (text.charCodeAt(close + 1) === QUOTE) {
            value += '"';
            start = close + 2;
            continue;
          }
          pos = close + 1;
          break;
        }
        // Stray characters between a closing quote and the separator are kept
        // rather than thrown away: `"abc"def` reads as abcdef.
        const tail = pos;
        while (pos < n && !endsField(text.charCodeAt(pos))) pos++;
        if (pos > tail) value += text.slice(tail, pos);
      } else {
        const start = pos;
        while (pos < n && !endsField(text.charCodeAt(pos))) pos++;
        value = text.slice(start, pos);
      }

      row.push(value);
      if (pos < n && text.charCodeAt(pos) === delim) {
        pos++;
        continue;
      }
      break;
    }

    // Consume the line ending: CRLF, LF, or a lone CR (old Mac exports).
    if (pos < n) {
      pos += text.charCodeAt(pos) === CR && text.charCodeAt(pos + 1) === LF ? 2 : 1;
    } else {
      pos = n + 1;
    }

    if (!(row.length === 1 && row[0] === "")) rows.push(row);
  }

  return rows;
}
