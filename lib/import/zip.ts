import { Inflate } from "fflate";

/**
 * Reads one file out of a ZIP without loading the archive into memory.
 *
 * Apple Health's export.zip runs to hundreds of megabytes on a phone with a few
 * years of data, nearly all of it heart rate and step counts. A File is
 * random-access, so this reads the central directory from the end, jumps to the
 * one entry wanted, and inflates it a few megabytes at a time. Streaming the
 * archive front to back instead would have to guess where entries end, which
 * goes wrong on archives that write their sizes after the data.
 */

/** Anything that can hand over a byte range: a File/Blob in the browser, a buffer in tests. */
export type RandomAccess = {
  size: number;
  read(start: number, end: number): Promise<Uint8Array>;
};

export type ZipEntry = {
  name: string;
  /** 0 = stored, 8 = deflate. */
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

export function blobSource(blob: Blob): RandomAccess {
  return {
    size: blob.size,
    read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()),
  };
}

const u16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u32 = (b: Uint8Array, at: number) => (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
// Exact up to 2^53, far past any file a browser will hand over.
const u64 = (b: Uint8Array, at: number) => u32(b, at) + u32(b, at + 4) * 2 ** 32;

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX = 0xffffffff;

export async function isZip(source: RandomAccess): Promise<boolean> {
  if (source.size < 4) return false;
  return u32(await source.read(0, 4), 0) === LOCAL;
}

export async function listZipEntries(source: RandomAccess): Promise<ZipEntry[]> {
  // The end-of-directory record sits in the last 22 bytes plus a comment of up
  // to 64 KB, so search backwards through that window.
  const tailStart = Math.max(0, source.size - 22 - 0xffff);
  const tail = await source.read(tailStart, source.size);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tail, i) === EOCD) {
      at = i;
      break;
    }
  }
  if (at === -1) throw new Error("That zip file looks damaged — its table of contents is missing.");

  let count = u16(tail, at + 10);
  let directorySize = u32(tail, at + 12);
  let directoryOffset = u32(tail, at + 16);

  // Big archives keep the real numbers in a ZIP64 record just before.
  if (count === 0xffff || directorySize === MAX || directoryOffset === MAX) {
    const locatorAt = at - 20;
    if (locatorAt < 0 || u32(tail, locatorAt) !== ZIP64_LOCATOR) {
      throw new Error("That zip file is too large to read here.");
    }
    const recordOffset = u64(tail, locatorAt + 8);
    const record = await source.read(recordOffset, recordOffset + 56);
    if (u32(record, 0) !== ZIP64_EOCD) throw new Error("That zip file looks damaged.");
    count = u64(record, 32);
    directorySize = u64(record, 40);
    directoryOffset = u64(record, 48);
  }

  const directory = await source.read(directoryOffset, directoryOffset + directorySize);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= directory.length; i++) {
    if (u32(directory, p) !== CENTRAL) break;
    const method = u16(directory, p + 10);
    let compressedSize = u32(directory, p + 20);
    let uncompressedSize = u32(directory, p + 24);
    const nameLength = u16(directory, p + 28);
    const extraLength = u16(directory, p + 30);
    const commentLength = u16(directory, p + 32);
    let localHeaderOffset = u32(directory, p + 42);
    const name = decoder.decode(directory.subarray(p + 46, p + 46 + nameLength));

    // ZIP64 extra field: only the values that overflowed are present, in this order.
    let extra = p + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = u16(directory, extra);
      const size = u16(directory, extra + 2);
      if (id === 0x0001) {
        let q = extra + 4;
        if (uncompressedSize === MAX) { uncompressedSize = u64(directory, q); q += 8; }
        if (compressedSize === MAX) { compressedSize = u64(directory, q); q += 8; }
        if (localHeaderOffset === MAX) { localHeaderOffset = u64(directory, q); }
      }
      extra += 4 + size;
    }

    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Inflates one entry, handing each piece of output to `onData` in order.
 * Reads `chunkSize` compressed bytes at a time, so memory stays flat however
 * large the entry is. XML compresses about twentyfold, so a megabyte in is
 * already twenty out — larger reads would make each piece unpleasantly big.
 */
export async function streamZipEntry(
  source: RandomAccess,
  entry: ZipEntry,
  onData: (bytes: Uint8Array, readFraction: number) => void | Promise<void>,
  chunkSize = 1024 * 1024,
): Promise<void> {
  const header = await source.read(entry.localHeaderOffset, entry.localHeaderOffset + 30);
  if (u32(header, 0) !== LOCAL) throw new Error("That zip file looks damaged.");
  const dataStart = entry.localHeaderOffset + 30 + u16(header, 26) + u16(header, 28);
  const dataEnd = dataStart + entry.compressedSize;

  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error("That zip uses a compression we can't read. Unzip it and choose export.xml instead.");
  }

  let output: Uint8Array[] = [];
  const inflate = entry.method === 8 ? new Inflate((data) => void output.push(data)) : null;

  for (let at = dataStart; at < dataEnd; at += chunkSize) {
    const end = Math.min(at + chunkSize, dataEnd);
    const bytes = await source.read(at, end);
    const last = end >= dataEnd;
    if (inflate) inflate.push(bytes, last);
    else output.push(bytes);

    const pieces = output;
    output = [];
    const fraction = (end - dataStart) / Math.max(1, entry.compressedSize);
    for (const piece of pieces) await onData(piece, fraction);
  }
}
