import type { Lesson } from '../lib/ics';
import { axisBounds, layoutDay, type Placed } from '../lib/layout';
import { addDays, formatTime, keyToWallClock, minutesOfDay, pad, weekdayName } from '../lib/time';
import { emptyGlyph, esc, hueStyle, lessonStateAt, nextLessonId, timeRange } from './shared';

export interface WeekViewInput {
  monday: string;
  /** Lessons for the whole week, keyed by day. */
  byDay: Map<string, Lesson[]>;
  today: string;
  now: Date;
}

export function renderWeek({ monday, byDay, today, now }: WeekViewInput): string {
  // Mon–Fri always; Sat/Sun only when something is scheduled.
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const key = addDays(monday, i);
    if (i < 5 || (byDay.get(key)?.length ?? 0) > 0) days.push(key);
  }

  const placedByDay = new Map<string, Placed[]>();
  const allPlaced: Placed[] = [];
  for (const key of days) {
    const p = layoutDay(byDay.get(key) ?? []);
    placedByDay.set(key, p);
    allPlaced.push(...p);
  }

  const total = days.reduce((n, k) => n + (byDay.get(k)?.length ?? 0), 0);
  if (total === 0) {
    return `<section class="week week--empty">
      ${renderHeaders(days, today)}
      <div class="empty empty--week">${emptyGlyph('rest')}<h2>Inga lektioner den här veckan</h2><p>Lov, eller så har skolan inte lagt in schemat ännu.</p></div>
    </section>`;
  }

  const axis = axisBounds(allPlaced);
  const hours: string[] = [];
  for (let h = axis.start; h <= axis.end; h++) {
    hours.push(`<div class="hour" style="--h:${h - axis.start}"><span>${pad(h)}</span></div>`);
  }

  const nowMin = minutesOfDay(now);
  const columns = days
    .map((key) => {
      const isToday = key === today;
      const dayLessons = byDay.get(key) ?? [];
      const nextId = isToday ? nextLessonId(dayLessons, now) : null;
      const allDay = dayLessons.filter((l) => l.allDay);
      const blocks = (placedByDay.get(key) ?? [])
        .map(({ lesson: l, startMin, endMin, col, cols }) => {
          const state = lessonStateAt(l, now, nextId, isToday);
          const dur = Math.max(15, endMin - startMin);
          return `<button class="wlesson lesson--${state}${l.cancelled ? ' lesson--cancelled' : ''}${dur < 40 ? ' wlesson--short' : ''}${cols > 1 ? ' wlesson--narrow' : ''}"
            style="${hueStyle(l)};--s:${startMin - axis.start * 60};--d:${dur};--col:${col};--cols:${cols}"
            data-action="open" data-id="${esc(l.id)}" aria-label="${esc(l.title)} ${timeRange(l)}" title="${esc(l.title)} ${timeRange(l)}${l.location ? ' · ' + esc(l.location) : ''}">
            <span class="wlesson__title">${esc(l.title)}</span>
            <span class="wlesson__meta"><span class="wlesson__time">${formatTime(l.start)}</span>${l.location ? `<span class="wlesson__room"> · ${esc(l.location)}</span>` : ''}</span>
          </button>`;
        })
        .join('');
      const showNow = isToday && nowMin >= axis.start * 60 && nowMin <= axis.end * 60;
      const nowLine = showNow ? `<div class="nowline nowline--week" style="--s:${nowMin - axis.start * 60}" aria-hidden="true"></div>` : '';
      const alldayHtml = allDay.length
        ? `<div class="wcol__allday">${allDay.map((l) => `<span class="wcol__chip" style="${hueStyle(l)}" title="${esc(l.title)}">${esc(l.title)}</span>`).join('')}</div>`
        : '';
      return `<div class="wcol${isToday ? ' wcol--today' : ''}" data-day="${key}">${alldayHtml}<div class="wcol__events">${blocks}${nowLine}</div></div>`;
    })
    .join('');

  return `<section class="week" style="--days:${days.length};--hours:${axis.end - axis.start}">
    ${renderHeaders(days, today)}
    <div class="week__body">
      <div class="timeline__rail">${hours.join('')}</div>
      <div class="week__cols">${columns}</div>
    </div>
  </section>`;
}

function renderHeaders(days: string[], today: string): string {
  return `<div class="week__head" style="--days:${days.length}">
    <div class="week__corner"></div>
    ${days
      .map((key) => {
        const w = keyToWallClock(key);
        const isToday = key === today;
        return `<button class="dayhead${isToday ? ' dayhead--today' : ''}" data-action="goto-day" data-day="${key}" aria-label="Visa ${weekdayName(key)} ${w.day}">
          <span class="dayhead__name">${weekdayName(key, true)}</span>
          <span class="dayhead__num">${w.day}</span>
        </button>`;
      })
      .join('')}
  </div>`;
}
