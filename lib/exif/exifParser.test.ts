import { describe, expect, it } from "vitest";
import { parseJpegExif } from "./exifParser";

type FieldSpec =
  | { tag: number; type: 2; ascii: string } // ASCII, null-terminated
  | { tag: number; type: 5; rationals: [number, number][] }; // unsigned rational

interface IfdSpec {
  fields: FieldSpec[];
  /** Populated after layout: tiffStart-relative offset of this IFD's directory. */
  offset?: number;
}

/**
 * Lays out a minimal little-endian TIFF/EXIF structure: IFD0 (Make, Model,
 * pointers to the Exif and GPS sub-IFDs), an Exif IFD (DateTimeOriginal),
 * and a GPS IFD (lat/lon ref + rationals) - then wraps it in a JPEG APP1
 * segment. Only exercises the fields PhotoMetadataModal actually reads.
 */
function buildFakeJpegWithExif({
  make,
  model,
  dateTimeOriginal,
  latRef,
  lat,
  lonRef,
  lon,
}: {
  make: string;
  model: string;
  dateTimeOriginal: string;
  latRef: "N" | "S";
  lat: [number, number][];
  lonRef: "E" | "W";
  lon: [number, number][];
}): ArrayBuffer {
  const ifd0: IfdSpec = {
    fields: [
      { tag: 0x010f, type: 2, ascii: make },
      { tag: 0x0110, type: 2, ascii: model },
      // Pointers filled in below once sub-IFD offsets are known.
    ],
  };
  const exifIfd: IfdSpec = { fields: [{ tag: 0x9003, type: 2, ascii: dateTimeOriginal }] };
  const gpsIfd: IfdSpec = {
    fields: [
      { tag: 0x0001, type: 2, ascii: latRef },
      { tag: 0x0002, type: 5, rationals: lat },
      { tag: 0x0003, type: 2, ascii: lonRef },
      { tag: 0x0004, type: 5, rationals: lon },
    ],
  };

  const dirSize = (ifd: IfdSpec) => 2 + ifd.fields.length * 12 + 4;

  // IFD0 needs two extra pointer fields whose values we know are LONGs.
  const ifd0FieldCount = ifd0.fields.length + 2;
  const ifd0Size = 2 + ifd0FieldCount * 12 + 4;

  let cursor = 8 + ifd0Size; // tiffStart-relative: IFD0 directory starts at 8

  // Assign external-data offsets for IFD0's own fields (Make/Model).
  const ifd0DataOffsets = ifd0.fields.map((field) => {
    const start = cursor;
    const ascii = field as Extract<FieldSpec, { type: 2 }>;
    cursor += ascii.ascii.length + 1;
    return start;
  });

  const exifIfdOffset = cursor;
  cursor += dirSize(exifIfd);
  const exifDataOffsets = exifIfd.fields.map((field) => {
    const start = cursor;
    const ascii = field as Extract<FieldSpec, { type: 2 }>;
    cursor += ascii.ascii.length + 1;
    return start;
  });

  const gpsIfdOffset = cursor;
  cursor += dirSize(gpsIfd);
  const gpsDataOffsets = gpsIfd.fields.map((field) => {
    const start = cursor;
    if (field.type === 2) {
      if (field.ascii.length + 1 <= 4) return -1; // inline, no external data
      cursor += field.ascii.length + 1;
    } else {
      cursor += field.rationals.length * 8;
    }
    return start;
  });

  const tiffSize = cursor;
  const tiffStart = 12; // after SOI(2) + APP1 marker(2) + length(2) + "Exif\0\0"(6)
  const totalSize = tiffStart + tiffSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint16(0, 0xffd8); // SOI
  view.setUint16(2, 0xffe1); // APP1
  view.setUint16(4, 2 + 6 + tiffSize); // segment length (big-endian per JPEG spec)
  "Exif\0\0".split("").forEach((ch, i) => bytes.set([ch.charCodeAt(0)], 6 + i));

  view.setUint16(tiffStart, 0x4949, true); // "II" little-endian
  view.setUint16(tiffStart + 2, 42, true);
  view.setUint32(tiffStart + 4, 8, true); // IFD0 offset

  function writeAsciiInline(entryValueOffset: number, text: string) {
    for (let i = 0; i < 4; i++) bytes[entryValueOffset + i] = i < text.length ? text.charCodeAt(i) : 0;
  }
  function writeAsciiExternal(dataOffset: number, text: string) {
    for (let i = 0; i < text.length; i++) bytes[dataOffset + i] = text.charCodeAt(i);
    bytes[dataOffset + text.length] = 0;
  }
  function writeRationalsExternal(dataOffset: number, rationals: [number, number][]) {
    rationals.forEach(([n, d], i) => {
      view.setUint32(dataOffset + i * 8, n, true);
      view.setUint32(dataOffset + i * 8 + 4, d, true);
    });
  }

  function writeIfd(dirOffset: number, ifd: IfdSpec, dataOffsets: number[], extraEntries: { tag: number; type: number; count: number; value: number }[] = []) {
    const abs = tiffStart + dirOffset;
    const totalEntries = ifd.fields.length + extraEntries.length;
    view.setUint16(abs, totalEntries, true);

    ifd.fields.forEach((field, i) => {
      const entryOffset = abs + 2 + i * 12;
      const count = field.type === 2 ? field.ascii.length + 1 : field.rationals.length;
      view.setUint16(entryOffset, field.tag, true);
      view.setUint16(entryOffset + 2, field.type, true);
      view.setUint32(entryOffset + 4, count, true);
      const valueFieldOffset = entryOffset + 8;

      if (field.type === 2 && field.ascii.length + 1 <= 4) {
        writeAsciiInline(valueFieldOffset, field.ascii);
      } else {
        view.setUint32(valueFieldOffset, dataOffsets[i], true);
        if (field.type === 2) writeAsciiExternal(tiffStart + dataOffsets[i], field.ascii);
        else writeRationalsExternal(tiffStart + dataOffsets[i], field.rationals);
      }
    });

    extraEntries.forEach((entry, i) => {
      const entryOffset = abs + 2 + (ifd.fields.length + i) * 12;
      view.setUint16(entryOffset, entry.tag, true);
      view.setUint16(entryOffset + 2, entry.type, true);
      view.setUint32(entryOffset + 4, entry.count, true);
      view.setUint32(entryOffset + 8, entry.value, true);
    });

    view.setUint32(abs + 2 + totalEntries * 12, 0, true); // next IFD offset (none)
  }

  writeIfd(8, ifd0, ifd0DataOffsets, [
    { tag: 0x8769, type: 4, count: 1, value: exifIfdOffset },
    { tag: 0x8825, type: 4, count: 1, value: gpsIfdOffset },
  ]);
  writeIfd(exifIfdOffset, exifIfd, exifDataOffsets);
  writeIfd(gpsIfdOffset, gpsIfd, gpsDataOffsets);

  return buffer;
}

function bufferToFile(buffer: ArrayBuffer) {
  return new File([buffer], "tree.jpg", { type: "image/jpeg" });
}

describe("parseJpegExif", () => {
  it("extracts device, timestamp, and GPS position from a JPEG's EXIF segment", async () => {
    const buffer = buildFakeJpegWithExif({
      make: "Google",
      model: "Pixel 8",
      dateTimeOriginal: "2026:07:24 09:15:32",
      latRef: "N",
      lat: [
        [6, 1],
        [31, 1],
        [2784, 100], // 6°31'27.84"N
      ],
      lonRef: "E",
      lon: [
        [3, 1],
        [22, 1],
        [4512, 100],
      ],
    });

    const metadata = await parseJpegExif(bufferToFile(buffer));

    expect(metadata.deviceMake).toBe("Google");
    expect(metadata.deviceModel).toBe("Pixel 8");
    expect(metadata.capturedAt?.toISOString().slice(0, 10)).toBe("2026-07-24");
    expect(metadata.gps?.latitude).toBeCloseTo(6.5244, 3);
    expect(metadata.gps?.longitude).toBeCloseTo(3.3792, 3);
  });

  it("flips the sign for southern and western hemispheres", async () => {
    const buffer = buildFakeJpegWithExif({
      make: "Apple",
      model: "iPhone 15",
      dateTimeOriginal: "2026:03:11 14:00:00",
      latRef: "S",
      lat: [
        [23, 1],
        [33, 1],
        [0, 1],
      ],
      lonRef: "W",
      lon: [
        [46, 1],
        [38, 1],
        [0, 1],
      ],
    });

    const metadata = await parseJpegExif(bufferToFile(buffer));

    expect(metadata.gps?.latitude).toBeLessThan(0);
    expect(metadata.gps?.longitude).toBeLessThan(0);
  });

  it("returns empty metadata for a file with no EXIF segment", async () => {
    const plainJpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "plain.jpg", {
      type: "image/jpeg",
    });

    const metadata = await parseJpegExif(plainJpeg);

    expect(metadata.gps).toBeNull();
    expect(metadata.capturedAt).toBeNull();
    expect(metadata.deviceMake).toBeNull();
  });
});
