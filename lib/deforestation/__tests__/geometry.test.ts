import { describe, expect, it } from 'vitest';

import {
  affectedAreaPolygonFor,
  boundingBox,
  closeRing,
  pointInPolygon,
  rectangleForArea,
  ringIntersectsArea,
} from '../geometry';

const SQUARE: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

describe('deforestation geometry (Issue #672)', () => {
  it('closes unclosed rings and leaves closed rings untouched', () => {
    expect(closeRing(SQUARE)).toHaveLength(5);
    expect(closeRing(SQUARE.slice(0, 4))).toHaveLength(5);
    expect(closeRing([])).toHaveLength(0);
  });

  it('computes a centroid inside the polygon', () => {
    expect(pointInPolygon([0.5, 0.5], SQUARE)).toBe(true);
    expect(pointInPolygon([1.5, 0.5], SQUARE)).toBe(false);
    expect(pointInPolygon([-0.1, 0.5], SQUARE)).toBe(false);
  });

  it('computes bounding boxes and overlap', () => {
    expect(boundingBox(SQUARE)).toEqual({ west: 0, east: 1, south: 0, north: 1 });
    expect(
      ringIntersectsArea(SQUARE, [
        [0.5, 0.5],
        [2, 0.5],
        [2, 2],
        [0.5, 0.5],
      ])
    ).toBe(true);
    expect(
      ringIntersectsArea(SQUARE, [
        [5, 5],
        [6, 5],
        [6, 6],
        [5, 5],
      ])
    ).toBe(false);
  });

  it('builds a closed affected-area rectangle around a detection point', () => {
    const ring = rectangleForArea([-54.9, -3.9], 4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring).toHaveLength(5);
    // Detection point sits inside its own affected-area polygon.
    expect(pointInPolygon([-54.9, -3.9], ring)).toBe(true);
  });

  it('falls back to confidence-based area when the provider reports none', () => {
    const small = affectedAreaPolygonFor([0, 0], 0, 'low');
    const large = affectedAreaPolygonFor([0, 0], 0, 'high');
    const smallBox = boundingBox(small);
    const largeBox = boundingBox(large);
    expect(largeBox.east - largeBox.west).toBeGreaterThan(smallBox.east - smallBox.west);
  });

  it('scales the affected-area rectangle roughly with reported hectares', () => {
    const oneHa = boundingBox(rectangleForArea([0, 0], 1));
    const nineHa = boundingBox(rectangleForArea([0, 0], 9));
    const widthOne = oneHa.east - oneHa.west;
    const widthNine = nineHa.east - nineHa.west;
    expect(widthNine / widthOne).toBeCloseTo(3, 1);
  });
});
