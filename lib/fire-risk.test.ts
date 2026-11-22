import { describe, expect, it } from 'vitest';
import { levelFromFwi } from './fire-risk';

describe('fire weather risk levels', () => {
  it('maps OpenWeather FWI thresholds to the four product levels', () => {
    expect(levelFromFwi(0)).toBe('Low');
    expect(levelFromFwi(11.2)).toBe('Medium');
    expect(levelFromFwi(21.3)).toBe('High');
    expect(levelFromFwi(50)).toBe('Extreme');
  });
});
