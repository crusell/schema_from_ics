import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash } from '../src/lib/route';

const TODAY = '2026-11-04'; // Wednesday, week 45 (Mon 2 Nov)

describe('routeHash', () => {
  it('leaves the date out for today and for this week', () => {
    expect(routeHash('day', TODAY, TODAY)).toBe('#/dag');
    expect(routeHash('week', '2026-11-02', TODAY)).toBe('#/vecka');
    expect(routeHash('week', '2026-11-08', TODAY)).toBe('#/vecka');
  });

  it('keeps the date for other days and weeks', () => {
    expect(routeHash('day', '2026-11-05', TODAY)).toBe('#/dag/2026-11-05');
    expect(routeHash('week', '2026-11-09', TODAY)).toBe('#/vecka/2026-11-09');
  });
});

describe('parseRoute', () => {
  it('reads dated and undated routes, undated meaning today', () => {
    expect(parseRoute('#/dag', TODAY)).toEqual({ view: 'day', day: TODAY });
    expect(parseRoute('#/vecka', TODAY)).toEqual({ view: 'week', day: TODAY });
    expect(parseRoute('#/dag/2026-10-12', TODAY)).toEqual({ view: 'day', day: '2026-10-12' });
  });

  it('rejects anything else', () => {
    expect(parseRoute('', TODAY)).toBeNull();
    expect(parseRoute('#/dag/igår', TODAY)).toBeNull();
  });
});
