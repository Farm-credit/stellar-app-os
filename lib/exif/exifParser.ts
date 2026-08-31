import type { PhotoMetadata } from "./types";

/**
 * Minimal, dependency-free EXIF reader for JPEG files.
 *
 * Walks the JPEG segment markers to find the APP1 (EXIF) segment, then reads
 * the embedded TIFF structure well enough to pull the three fields this
 * modal cares about: GPS position, capture timestamp, and device make/model.
 * It intentionally does not attempt to parse every EXIF tag - only what the
 * UI displays - to keep the client bundle small.
 */

const JPEG_SOI = 0xffd8;
const APP1_MARKER = 0xffe1;
const EXIF_HEADER = "Exif\0\0";

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_GPS_IFD_POINTER = 0x8825;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;
const TAG_GPS_ALTITUDE_REF = 0x0005;
const TAG_GPS_ALTITUDE = 0x0006;

class TiffReader {
  constructor(
    private view: DataView,
    private littleEndian: boolean,
    /** Offset of the start of the TIFF header within the source buffer. */
    private tiffStart: number
  ) {}

  u16(offset: number): number {
    return this.view.getUint16(offset, this.littleEndian);
  }

  u32(offset: number): number {
    return this.view.getUint32(offset, this.littleEndian);
  }

  /** Reads one IFD (Image File Directory) and returns its tag -> raw entry map. */
  readIfd(ifdOffset: number): Map<number, { type: number; count: number; valueOffset: number }> {
    const absolute = this.tiffStart + ifdOffset;
    const entryCount = this.u16(absolute);
    const entries = new Map<number, { type: number; count: number; valueOffset: number }>();

    for (let i = 0; i < entryCount; i++) {
      const entryOffset = absolute + 2 + i * 12;
      const tag = this.u16(entryOffset);
      const type = this.u16(entryOffset + 2);
      const count = this.u32(entryOffset + 4);
      entries.set(tag, { type, count, valueOffset: entryOffset + 8 });
    }
    return entries;
  }

  readAscii(entry: { count: number; valueOffset: number }): string {
    const dataOffset =
      entry.count > 4 ? this.tiffStart + this.u32(entry.valueOffset) : entry.valueOffset;
    const bytes: number[] = [];
    for (let i = 0; i < entry.count - 1; i++) {
      bytes.push(this.view.getUint8(dataOffset + i));
    }
    return String.fromCharCode(...bytes).trim();
  }

  readRational(offset: number): number {
    const numerator = this.u32(offset);
    const denominator = this.u32(offset + 4);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /** GPS lat/lon are stored as 3 rationals (degrees, minutes, seconds). */
  readGpsCoordinate(entry: { count: number; valueOffset: number }): number {
    const dataOffset = this.tiffStart + this.u32(entry.valueOffset);
    const degrees = this.readRational(dataOffset);
    const minutes = this.readRational(dataOffset + 8);
    const seconds = this.readRational(dataOffset + 16);
    return degrees + minutes / 60 + seconds / 3600;
  }

  readByteOrShort(entry: { type: number; valueOffset: number }): number {
    return entry.type === 1 ? this.view.getUint8(entry.valueOffset) : this.u16(entry.valueOffset);
  }
}

function parseExifDate(raw: string): Date | null {
  // EXIF timestamps look like "2026:07:24 09:15:32".
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isNaN(date.getTime()) ? null : date;
}

function findApp1(view: DataView): number | null {
  if (view.getUint16(0) !== JPEG_SOI) return null;

  let offset = 2;
  while (offset < view.byteLength - 4) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) break; // not a marker, bail out
    const segmentLength = view.getUint16(offset + 2);

    if (marker === APP1_MARKER) {
      const headerText = String.fromCharCode(
        ...new Uint8Array(view.buffer, view.byteOffset + offset + 4, EXIF_HEADER.length)
      );
      if (headerText === EXIF_HEADER) return offset + 4 + EXIF_HEADER.length;
    }

    if (marker === 0xffda) break; // start of scan - no more metadata segments follow
    offset += 2 + segmentLength;
  }
  return null;
}

export async function parseJpegExif(file: File): Promise<PhotoMetadata> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);

  const empty: PhotoMetadata = {
    gps: null,
    capturedAt: null,
    deviceMake: null,
    deviceModel: null,
  };

  const tiffStart = findApp1(view);
  if (tiffStart === null) return empty;

  const byteOrderMark = view.getUint16(tiffStart);
  const littleEndian = byteOrderMark === 0x4949; // "II"
  const reader = new TiffReader(view, littleEndian, tiffStart);

  const firstIfdOffset = reader.u32(tiffStart + 4);
  const ifd0 = reader.readIfd(firstIfdOffset);

  const deviceMake = ifd0.has(TAG_MAKE) ? reader.readAscii(ifd0.get(TAG_MAKE)!) : null;
  const deviceModel = ifd0.has(TAG_MODEL) ? reader.readAscii(ifd0.get(TAG_MODEL)!) : null;

  let capturedAt: Date | null = null;
  if (ifd0.has(TAG_EXIF_IFD_POINTER)) {
    const exifIfd = reader.readIfd(reader.u32(ifd0.get(TAG_EXIF_IFD_POINTER)!.valueOffset));
    const dateEntry = exifIfd.get(TAG_DATETIME_ORIGINAL) ?? exifIfd.get(TAG_DATETIME);
    if (dateEntry) capturedAt = parseExifDate(reader.readAscii(dateEntry));
  }
  if (!capturedAt && ifd0.has(TAG_DATETIME)) {
    capturedAt = parseExifDate(reader.readAscii(ifd0.get(TAG_DATETIME)!));
  }

  let gps: PhotoMetadata["gps"] = null;
  if (ifd0.has(TAG_GPS_IFD_POINTER)) {
    const gpsIfd = reader.readIfd(reader.u32(ifd0.get(TAG_GPS_IFD_POINTER)!.valueOffset));
    const latEntry = gpsIfd.get(TAG_GPS_LAT);
    const lonEntry = gpsIfd.get(TAG_GPS_LON);

    if (latEntry && lonEntry) {
      const latRef = gpsIfd.has(TAG_GPS_LAT_REF)
        ? reader.readAscii({ count: 2, valueOffset: gpsIfd.get(TAG_GPS_LAT_REF)!.valueOffset })
        : "N";
      const lonRef = gpsIfd.has(TAG_GPS_LON_REF)
        ? reader.readAscii({ count: 2, valueOffset: gpsIfd.get(TAG_GPS_LON_REF)!.valueOffset })
        : "E";

      const latitude = reader.readGpsCoordinate(latEntry) * (latRef === "S" ? -1 : 1);
      const longitude = reader.readGpsCoordinate(lonEntry) * (lonRef === "W" ? -1 : 1);

      let altitude: number | undefined;
      if (gpsIfd.has(TAG_GPS_ALTITUDE)) {
        const altEntry = gpsIfd.get(TAG_GPS_ALTITUDE)!;
        const altOffset = tiffStart + reader.u32(altEntry.valueOffset);
        altitude = reader.readRational(altOffset);
        const belowSeaLevel = gpsIfd.has(TAG_GPS_ALTITUDE_REF)
          ? reader.readByteOrShort(gpsIfd.get(TAG_GPS_ALTITUDE_REF)!) === 1
          : false;
        if (belowSeaLevel) altitude *= -1;
      }

      gps = { latitude, longitude, altitude };
    }
  }

  return { gps, capturedAt, deviceMake, deviceModel };
}
