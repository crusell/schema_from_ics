import type { Lesson } from '../lib/ics';
import { axisBounds, layoutDay } from '../lib/layout';
import { formatTime, minutesOfDay, pad, weekdayIndex } from '../lib/time';
import {
  durationMinutes,
  emptyGlyph,
  esc,
  hueStyle,
  inLabel,
  lessonStateAt,
  minutesUntil,
  nextLessonId,
  teacherOf,
  timeRange,
} from './shared';

export interface DayViewInput {
  dayKey: string;
  lessons: Lesson[];
  now: Date;
  isToday: boolean;
}

export function renderDay({ dayKey, lessons, now, isToday }: DayViewInput): string {
  const allDay = lessons.filter((l) => l.allDay);
  const timed = lessons.filter((l) => !l.allDay);
  const nextId = isToday ? nextLessonId(timed, now) : null;

  const parts: string[] = [];
  if (isToday) parts.push(renderNowCard(timed, now, nextId));
  if (allDay.length) {
    parts.push(
      `<div class="allday">${allDay
        .map(
          (l) =>
            `<button class="allday__chip" style="${hueStyle(l)}" data-action="open" data-id="${esc(l.id)}">
              <span class="allday__dot"></span>${esc(l.title)}</button>`,
        )
        .join('')}</div>`,
    );
  }

  if (timed.length === 0) {
    const weekend = weekdayIndex(dayKey) >= 5;
    parts.push(renderEmptyDay(weekend ? 'weekend' : allDay.length ? 'allday' : 'free', allDay[0]?.title));
    return `<section class="day">${parts.join('')}</section>`;
  }

  const placed = layoutDay(timed);
  const axis = axisBounds(placed);
  const hours: string[] = [];
  for (let h = axis.start; h <= axis.end; h++) {
    hours.push(`<div class="hour" style="--h:${h - axis.start}"><span>${pad(h)}</span></div>`);
  }

  const blocks = placed
    .map(({ lesson: l, startMin, endMin, col, cols }) => {
      const state = lessonStateAt(l, now, nextId, isToday);
      const teacher = teacherOf(l);
      const dur = endMinutes(endMin, startMin);
      const short = dur < 35;
      return `<button class="lesson lesson--${state}${l.cancelled ? ' lesson--cancelled' : ''}${short ? ' lesson--short' : ''}"
        style="${hueStyle(l)};--s:${startMin - axis.start * 60};--d:${dur};--col:${col};--cols:${cols}"
        data-action="open" data-id="${esc(l.id)}" aria-label="${esc(l.title)} ${timeRange(l)}">
        <span class="lesson__bar"></span>
        <span class="lesson__body">
          <span class="lesson__head">
            <span class="lesson__title">${esc(l.title)}</span>
            ${state === 'now' ? '<span class="tag tag--now">Nu</span>' : ''}
            ${state === 'next' ? '<span class="tag tag--next">Nästa</span>' : ''}
            ${l.cancelled ? '<span class="tag tag--cancelled">Inställd</span>' : ''}
          </span>
          <span class="lesson__meta">
            <span class="lesson__time">${timeRange(l)}</span>
            ${l.location ? `<span class="lesson__room">${esc(l.location)}</span>` : ''}
            ${teacher && !short ? `<span class="lesson__teacher">${esc(teacher)}</span>` : ''}
          </span>
        </span>
      </button>`;
    })
    .join('');

  const nowMin = minutesOfDay(now);
  const showNow = isToday && nowMin >= axis.start * 60 && nowMin <= axis.end * 60;
  const nowLine = showNow
    ? `<div class="nowline" style="--s:${nowMin - axis.start * 60}" aria-hidden="true"><span class="nowline__time">${formatTime(now)}</span></div>`
    : '';

  parts.push(
    `<div class="timeline" style="--hours:${axis.end - axis.start}">
      <div class="timeline__rail">${hours.join('')}</div>
      <div class="timeline__events">${blocks}${nowLine}</div>
    </div>`,
  );

  return `<section class="day">${parts.join('')}</section>`;
}

function endMinutes(endMin: number, startMin: number): number {
  return Math.max(15, endMin - startMin);
}

function renderNowCard(timed: Lesson[], now: Date, nextId: string | null): string {
  const t = now.getTime();
  const current = timed.find((l) => !l.cancelled && l.start.getTime() <= t && t < l.end.getTime());
  const next = nextId ? timed.find((l) => l.id === nextId) : undefined;
  if (!current && !next) {
    const anyLeft = timed.some((l) => l.end.getTime() > t);
    if (timed.length === 0 || anyLeft) return '';
    return `<div class="nowcard nowcard--done"><span class="nowcard__label">Klart för idag</span><span class="nowcard__title">Skoldagen är slut</span></div>`;
  }
  if (current) {
    const left = minutesUntil(current.end, now);
    return `<button class="nowcard" style="${hueStyle(current)}" data-action="open" data-id="${esc(current.id)}">
      <span class="nowcard__label"><span class="pulse"></span>Pågår · slutar ${formatTime(current.end)}</span>
      <span class="nowcard__title">${esc(current.title)}</span>
      <span class="nowcard__meta">${current.location ? esc(current.location) + ' · ' : ''}${left} min kvar${
        next ? ` · sedan ${esc(next.title)} ${formatTime(next.start)}` : ''
      }</span>
    </button>`;
  }
  const n = next!;
  const until = minutesUntil(n.start, now);
  return `<button class="nowcard" style="${hueStyle(n)}" data-action="open" data-id="${esc(n.id)}">
    <span class="nowcard__label">Nästa · ${inLabel(until)}</span>
    <span class="nowcard__title">${esc(n.title)}</span>
    <span class="nowcard__meta">${timeRange(n)}${n.location ? ' · ' + esc(n.location) : ''} · ${durationMinutes(n)} min</span>
  </button>`;
}

function renderEmptyDay(kind: 'weekend' | 'allday' | 'free', title?: string): string {
  const map = {
    weekend: { head: 'Helg', body: 'Inga lektioner – vila upp dig.' },
    allday: { head: title ?? 'Ledigt', body: 'Inga lektioner den här dagen.' },
    free: { head: 'Inga lektioner', body: 'Schemat har inget inlagt den här dagen.' },
  } as const;
  const m = map[kind];
  return `<div class="empty empty--day">${emptyGlyph(kind === 'free' ? 'calendar' : 'rest')}<h2>${esc(m.head)}</h2><p>${m.body}</p></div>`;
}
