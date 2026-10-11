import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { subjectHue } from '../src/lib/colors';
import { parseSchedule, type Lesson } from '../src/lib/ics';
import { renderDay } from '../src/views/day';
import { renderWeek } from '../src/views/week';

const fixture = readFileSync(new URL('./fixtures/schema.ics', import.meta.url), 'utf8');
const { lessons } = parseSchedule(fixture, { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2027-01-01T00:00:00Z') });
const now = new Date('2026-10-12T07:05:00Z');

function byDay(list: Lesson[]): Map<string, Lesson[]> {
  const map = new Map<string, Lesson[]>();
  for (const l of list) map.set(l.dayKey, [...(map.get(l.dayKey) ?? []), l]);
  return map;
}

function week(list: Lesson[]): string {
  return renderWeek({ monday: '2026-10-12', byDay: byDay(list), today: '2026-10-12', now });
}

function allDay(dayKey: string, title: string): Lesson {
  const start = new Date(`${dayKey}T00:00:00Z`);
  return { ...lessons[0], id: `${title}@${dayKey}`, uid: title, kind: 'handin', title, allDay: true, dayKey, start, end: start };
}

describe('renderDay', () => {
  const html = renderDay({ dayKey: '2026-10-14', lessons: lessons.filter((l) => l.dayKey === '2026-10-14'), now, isToday: false });

  it('shows a hand-in as a labelled row, not as an all-day chip', () => {
    expect(html).toMatch(/class="due"[^]*Inlämning<\/span><span class="due__title">Slöjdlogg åk 8/);
    expect(html).not.toContain('allday__chip');
  });
});

describe('renderWeek', () => {
  const html = week(lessons);

  it('puts all-day items in their own row, outside the time columns', () => {
    const row = html.slice(html.indexOf('week__allday'), html.indexOf('week__body'));
    expect(row).toContain('wcol__chip--due');
    expect(row).toContain('aria-label="Prov: Historia – Första världskriget"');
    expect(html.slice(html.indexOf('week__body'))).not.toContain('wcol__chip');
  });

  it('marks very short lessons so their title still fits', () => {
    expect(html).toMatch(/wlesson--tiny[^>]*aria-label="Mentorstid/);
    expect(html).not.toMatch(/wlesson--tiny[^>]*aria-label="Matematik/);
  });

  it('shows Mon–Fri, and the weekend only up to its last used day', () => {
    const columns = (h: string) => h.match(/class="wcol[ "]/g)?.length;
    expect(columns(html)).toBe(5);
    expect(columns(week([...lessons, allDay('2026-10-18', 'Söndagsinlämning')]))).toBe(7);
    expect(columns(week([...lessons, allDay('2026-10-17', 'Lördagsinlämning')]))).toBe(6);
  });
});

describe('subjectHue', () => {
  it('gives a course the colour of the subject it names', () => {
    expect(subjectHue('slöjd åk8')).toBe(subjectHue('slöjd'));
    expect(subjectHue('8:1 teknik och samhälle')).toBe(subjectHue('teknik'));
  });

  it('does not match short subject codes inside other words', () => {
    expect(subjectHue('no problem')).not.toBe(subjectHue('no'));
  });
});
