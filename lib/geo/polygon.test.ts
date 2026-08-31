import { describe, expect, it } from 'vitest';
import { checkRegionCoverage, containsPointInPolygon, normalizeLng, lngDelta } from './polygon';

describe('normalizeLng', () => {
  it('normalizes longitudes within range', () => {
    expect(normalizeLng(0)).toBe(0);
    expect(normalizeLng(90)).toBe(90);
    expect(normalizeLng(-90)).toBe(-90);
  });

  it('normalizes longitudes beyond ±180', () => {
    expect(normalizeLng(181)).toBe(-179);
    expect(normalizeLng(-181)).toBe(179);
    expect(normalizeLng(360)).toBe(0);
    expect(normalizeLng(-360)).toBe(0);
    expect(normalizeLng(540)).toBe(180);
    expect(normalizeLng(-540)).toBe(-180);
  });
});

describe('lngDelta', () => {
  it('calculates shortest delta considering wraparound', () => {
    expect(lngDelta(179, -179)).toBe(2); // Short path across date line
    expect(lngDelta(-179, 179)).toBe(-2);
    expect(lngDelta(90, -90)).toBe(180);
    expect(lngDelta(-90, 90)).toBe(-180);
    expect(lngDelta(10, 20)).toBe(-10);
  });
});

describe('containsPointInPolygon', () => {
  it('returns true for a point inside a simple polygon', () => {
    const polygon = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as [number, number][];

    expect(containsPointInPolygon(5, 5, polygon)).toBe(true);
    expect(containsPointInPolygon(11, 5, polygon)).toBe(false);
  });

  it('handles polygons crossing the date line', () => {
    // Fiji polygon: spans from 177° to -178° (crosses date line)
    const fijiPolygon = [
      [-20.0, 177.0],
      [-15.0, 177.0],
      [-15.0, -178.0],
      [-20.0, -178.0],
    ] as [number, number][];

    // Point inside Fiji (near Suva): lat=-18.1, lng=178.4
    expect(containsPointInPolygon(-18.1, 178.4, fijiPolygon)).toBe(true);
    // Point inside Fiji (near Nadi): lat=-17.8, lng=177.4
    expect(containsPointInPolygon(-17.8, 177.4, fijiPolygon)).toBe(true);
    // Point inside Fiji (near Labasa): lat=-16.4, lng=179.4
    expect(containsPointInPolygon(-16.4, 179.4, fijiPolygon)).toBe(true);
    // Point outside Fiji (in Australia)
    expect(containsPointInPolygon(-33.9, 151.2, fijiPolygon)).toBe(false);
  });

  it('handles Tonga polygon', () => {
    const tongaPolygon = [
      [-23.0, -176.0],
      [-15.0, -176.0],
      [-15.0, -173.0],
      [-23.0, -173.0],
    ] as [number, number][];

    // Point inside Tonga (near Nuku'alofa): lat=-21.2, lng=-175.2
    expect(containsPointInPolygon(-21.2, -175.2, tongaPolygon)).toBe(true);
    // Point outside Tonga
    expect(containsPointInPolygon(-14.0, -175.0, tongaPolygon)).toBe(false);
  });
});

describe('checkRegionCoverage', () => {
  it('matches the northern nigeria sample polygon', () => {
    expect(
      checkRegionCoverage({ latitude: 12.0, longitude: 8.5, regionCode: 'northern-nigeria' })
    ).toBe(true);
    expect(
      checkRegionCoverage({ latitude: 4.0, longitude: 3.0, regionCode: 'northern-nigeria' })
    ).toBe(true);
    expect(
      checkRegionCoverage({ latitude: 2.5, longitude: 4.0, regionCode: 'northern-nigeria' })
    ).toBe(false);
    expect(checkRegionCoverage({ latitude: 10.0, longitude: 2.0, regionCode: 'unknown' })).toBe(
      false
    );
  });

  it('matches Fiji region crossing the date line', () => {
    // Inside Fiji
    expect(checkRegionCoverage({ latitude: -18.1, longitude: 178.4, regionCode: 'fiji' })).toBe(
      true
    );
    // Outside Fiji
    expect(checkRegionCoverage({ latitude: -33.9, longitude: 151.2, regionCode: 'fiji' })).toBe(
      false
    );
  });

  it('matches Tonga region', () => {
    expect(checkRegionCoverage({ latitude: -21.2, longitude: -175.2, regionCode: 'tonga' })).toBe(
      true
    );
  });

  it('matches Samoa region', () => {
    expect(checkRegionCoverage({ latitude: -13.8, longitude: -172.0, regionCode: 'samoa' })).toBe(
      true
    );
  });
});
