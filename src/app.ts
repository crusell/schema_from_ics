import { IcsParseError, parseSchedule, type Lesson, type ParseWindow, type Schedule } from './lib/ics';
import { FeedError, fetchFeed, readCache, writeCache, type CachedFeed } from './lib/store';
import {
  addDays,
  capitalize,
  dayKey,
  formatDayMonth,
  formatRelative,
  formatWeekRange,
  isoWeek,
  startOfDay,
  startOfWeek,
  weekdayName,
} from './lib/time';
import { renderDay } from './views/day';
import { KIND_LABEL, durationMinutes, emptyGlyph, esc, hueStyle, timeRange } from './views/shared';
import { renderWeek } from './views/week';

type View = 'day' | 'week';
type Theme = 'auto' | 'light' | 'dark';

interface State {
  view: View;
  day: string;
  today: string;
  now: Date;
  feed: CachedFeed | null;
  schedule: Schedule | null;
  window: ParseWindow | null;
  loading: boolean;
  error: Error | null;
  online: boolean;
  selectedId: string | null;
  theme: Theme;
}

const THEME_KEY = 'schema:theme';
const WINDOW_BACK_DAYS = 90;
const WINDOW_AHEAD_DAYS = 200;
const REFRESH_MS = 30 * 60_000;
const STALE_MS = 5 * 60_000;

export function createApp(root: HTMLElement) {
  const now = new Date();
  const state: State = {
    view: 'day',
    day: dayKey(now),
    today: dayKey(now),
    now,
    feed: null,
    schedule: null,
    window: null,
    loading: true,
    error: null,
    online: navigator.onLine,
    selectedId: null,
    theme: readTheme(),
  };

  // ---------- data ----------

  function parseFeed(center: string): void {
    if (!state.feed) return;
    const window: ParseWindow = {
      from: startOfDay(addDays(center, -WINDOW_BACK_DAYS)),
      to: startOfDay(addDays(center, WINDOW_AHEAD_DAYS)),
    };
    try {
      state.schedule = parseSchedule(state.feed.ics, window);
      state.window = window;
      if (state.error instanceof IcsParseError) state.error = null;
    } catch (err) {
      state.schedule = null;
      state.window = null;
      state.error = err as Error;
    }
  }

  /** Re-expand recurrences if the user navigates outside the parsed window. */
  function ensureWindow(): void {
    if (!state.feed || !state.window) return;
    const t = startOfDay(state.day).getTime();
    const margin = 14 * 86_400_000;
    if (t - margin < state.window.from.getTime() || t + margin > state.window.to.getTime()) {
      parseFeed(state.day);
    }
  }

  async function refresh(): Promise<void> {
    state.loading = true;
    state.error = null;
    render();
    try {
      const feed = await fetchFeed();
      state.feed = feed;
      writeCache(feed);
      parseFeed(state.day);
    } catch (err) {
      state.error = err as Error;
    } finally {
      state.loading = false;
      render();
    }
  }

  // ---------- navigation ----------

  function go(view: View, day: string, push = true): void {
    state.view = view;
    state.day = day;
    state.selectedId = null;
    ensureWindow();
    const hash = `#/${view === 'day' ? 'dag' : 'vecka'}/${day}`;
    if (push && location.hash !== hash) history.pushState(null, '', hash);
    render();
  }

  function step(dir: 1 | -1, animate = true): void {
    const days = state.view === 'day' ? 1 : 7;
    const next = addDays(state.day, dir * days);
    if (animate) root.dataset.slide = dir === 1 ? 'left' : 'right';
    go(state.view, next);
  }

  function readRoute(): { view: View; day: string } | null {
    const m = location.hash.match(/^#\/(dag|vecka)\/(\d{4}-\d{2}-\d{2})$/);
    if (!m) return null;
    return { view: m[1] === 'dag' ? 'day' : 'week', day: m[2] };
  }

  // ---------- theme ----------

  function readTheme(): Theme {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return t === 'light' || t === 'dark' ? t : 'auto';
    } catch {
      return 'auto';
    }
  }

  function applyTheme(): void {
    const el = document.documentElement;
    if (state.theme === 'auto') delete el.dataset.theme;
    else el.dataset.theme = state.theme;
    try {
      if (state.theme === 'auto') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, state.theme);
    } catch {
      /* ignore */
    }
    // Keep the browser chrome colour in sync with the effective theme.
    const dark = state.theme === 'dark' || (state.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      m.content = dark ? '#131416' : '#f4f1ea';
      m.removeAttribute('media');
    }
  }

  // ---------- rendering ----------

  function lessonsForDay(key: string): Lesson[] {
    return state.schedule?.lessons.filter((l) => l.dayKey === key) ?? [];
  }

  function lessonsForWeek(monday: string): Map<string, Lesson[]> {
    const end = addDays(monday, 7);
    const map = new Map<string, Lesson[]>();
    for (const l of state.schedule?.lessons ?? []) {
      if (l.dayKey >= monday && l.dayKey < end) {
        const list = map.get(l.dayKey) ?? [];
        list.push(l);
        map.set(l.dayKey, list);
      }
    }
    return map;
  }

  function renderHeader(): string {
    const monday = startOfWeek(state.day);
    const { week } = isoWeek(state.day);
    const isTodayDay = state.day === state.today;
    const inThisWeek = startOfWeek(state.today) === monday;
    let title: string;
    let sub: string;
    if (state.view === 'day') {
      title = capitalize(weekdayName(state.day));
      sub = `${formatDayMonth(state.day)} · v. ${week}`;
    } else {
      title = `Vecka ${week}`;
      sub = formatWeekRange(monday, addDays(monday, 4));
    }
    const showToday = state.view === 'day' ? !isTodayDay : !inThisWeek;
    const todayTag = state.view === 'day' && isTodayDay ? '<span class="today-tag">Idag</span>' : '';
    const themeIcon = state.theme === 'dark' ? '☾' : state.theme === 'light' ? '☀' : '◐';
    const themeLabel = state.theme === 'dark' ? 'Mörkt tema' : state.theme === 'light' ? 'Ljust tema' : 'Automatiskt tema';

    return `<header class="top">
      <div class="top__brand">
        <span class="brand">${esc(state.schedule?.calendarName || 'Martins schema')}</span>
        ${renderStatus()}
        <button class="iconbtn" data-action="theme" aria-label="${themeLabel}" title="${themeLabel}">${themeIcon}</button>
      </div>
      <div class="top__title">
        <div class="top__text">
          <h1>${esc(title)} ${todayTag}</h1>
          <p>${esc(sub)}</p>
        </div>
        <nav class="bar bar--desktop" aria-label="Navigering">${renderNav(showToday)}</nav>
      </div>
    </header>`;
  }

  function renderNav(showToday: boolean): string {
    return `<div class="seg" role="group" aria-label="Vy">
        <button class="seg__btn${state.view === 'day' ? ' is-on' : ''}" data-action="view" data-view="day" aria-pressed="${state.view === 'day'}">Dag</button>
        <button class="seg__btn${state.view === 'week' ? ' is-on' : ''}" data-action="view" data-view="week" aria-pressed="${state.view === 'week'}">Vecka</button>
      </div>
      <div class="steps">
        <button class="stepbtn" data-action="prev" aria-label="${state.view === 'day' ? 'Föregående dag' : 'Föregående vecka'}">‹</button>
        <button class="todaybtn${showToday ? '' : ' is-hidden'}" data-action="today">Idag</button>
        <button class="stepbtn" data-action="next" aria-label="${state.view === 'day' ? 'Nästa dag' : 'Nästa vecka'}">›</button>
      </div>`;
  }

  function renderStatus(): string {
    if (state.loading && !state.feed) return `<span class="status status--loading">Hämtar…</span>`;
    const err = state.error;
    const fetched = state.feed ? formatRelative(new Date(state.feed.fetchedAt), state.now) : null;
    if (err instanceof FeedError) {
      if (err.kind === 'not-ics') {
        return `<button class="status status--warn" data-action="reload" title="${esc(err.message)}">Ladda om</button>`;
      }
      if (err.kind === 'offline' || err.kind === 'network') {
        return `<button class="status status--offline" data-action="refresh" title="${esc(err.message)}">Offline${fetched ? ` · ${fetched}` : ''}</button>`;
      }
      return `<button class="status status--warn" data-action="refresh" title="${esc(err.message)}">Kunde inte uppdatera${fetched ? ` · ${fetched}` : ''}</button>`;
    }
    if (err instanceof IcsParseError) {
      return `<button class="status status--warn" data-action="refresh" title="${esc(err.message)}">Kunde inte tolka schemat</button>`;
    }
    if (fetched) {
      return `<button class="status status--ok" data-action="refresh" title="Hämta igen">${state.loading ? 'Hämtar…' : `Uppdaterat ${fetched}`}</button>`;
    }
    return '';
  }

  function renderBody(): string {
    if (!state.schedule) {
      if (state.loading) return `<div class="empty empty--loading"><div class="spinner" aria-hidden="true"></div><p>Hämtar schemat…</p></div>`;
      const err = state.error;
      if (err instanceof FeedError && err.kind === 'not-ics') {
        return `<div class="empty empty--error">${emptyGlyph('lock')}<h2>Du behöver logga in igen</h2><p>${esc(err.message)}.</p><button class="btn" data-action="reload">Ladda om</button></div>`;
      }
      if (err instanceof FeedError && (err.kind === 'offline' || err.kind === 'network')) {
        return `<div class="empty empty--error">${emptyGlyph('offline')}<h2>Ingen anslutning</h2><p>Schemat har inte sparats på den här enheten ännu. Anslut till nätet och försök igen.</p><button class="btn" data-action="refresh">Försök igen</button></div>`;
      }
      return `<div class="empty empty--error">${emptyGlyph('warn')}<h2>Kunde inte hämta schemat</h2><p>${esc(err?.message ?? 'Okänt fel')}</p><button class="btn" data-action="refresh">Försök igen</button></div>`;
    }

    if (state.schedule.lessons.length === 0 && !hasAnyLessonsInFeed()) {
      const name = state.schedule.calendarName;
      return `<div class="empty empty--calendar">
        ${emptyGlyph('calendar')}
        <h2>Schemat är tomt ännu</h2>
        <p>${name ? `Kalendern <strong>${esc(name)}</strong> finns, men` : 'Kalendern'} innehåller inga lektioner. Skolan har förmodligen inte publicerat terminens schema ännu – appen hämtar igen automatiskt.</p>
        ${state.feed ? `<p class="empty__meta">Senast kontrollerat ${esc(formatRelative(new Date(state.feed.fetchedAt), state.now))}</p>` : ''}
        <button class="btn" data-action="refresh">Hämta igen</button>
      </div>`;
    }

    if (state.view === 'day') {
      return renderDay({
        dayKey: state.day,
        lessons: lessonsForDay(state.day),
        now: state.now,
        isToday: state.day === state.today,
      });
    }
    const monday = startOfWeek(state.day);
    return renderWeek({ monday, byDay: lessonsForWeek(monday), today: state.today, now: state.now });
  }

  /** Cheap check: does the raw feed contain any VEVENT at all? */
  function hasAnyLessonsInFeed(): boolean {
    return /BEGIN:VEVENT/i.test(state.feed?.ics ?? '');
  }

  function renderSheet(): string {
    const l = state.selectedId ? state.schedule?.lessons.find((x) => x.id === state.selectedId) : undefined;
    if (!l) return '<dialog class="sheet" id="sheet"></dialog>';
    const desc = l.description
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => `<p>${esc(line)}</p>`)
      .join('');
    const when = l.allDay
      ? `${KIND_LABEL[l.kind]} · ${weekdayName(l.dayKey)} ${formatDayMonth(l.dayKey)}`
      : `${capitalize(weekdayName(l.dayKey))} ${formatDayMonth(l.dayKey)} · ${timeRange(l)} · ${durationMinutes(l)} min`;
    return `<dialog class="sheet" id="sheet" style="${hueStyle(l)}" aria-labelledby="sheet-title">
      <div class="sheet__grab" aria-hidden="true"></div>
      <div class="sheet__bar"></div>
      <h2 id="sheet-title" class="sheet__title">${esc(l.title)}${l.cancelled ? ' <span class="tag tag--cancelled">Inställd</span>' : ''}</h2>
      <p class="sheet__when">${esc(when)}</p>
      ${
        l.location || l.course
          ? `<dl class="sheet__facts">
        ${l.location ? `<div><dt>Sal</dt><dd>${esc(l.location)}</dd></div>` : ''}
        ${l.course ? `<div><dt>Kurs</dt><dd>${esc(l.course)}</dd></div>` : ''}
      </dl>`
          : ''
      }
      ${desc ? `<div class="sheet__desc">${desc}</div>` : ''}
      <button class="btn btn--ghost" data-action="close">Stäng</button>
    </dialog>`;
  }

  function render(): void {
    const scrollY = window.scrollY;
    root.innerHTML = `${renderHeader()}
      <main class="stage" id="stage">${renderBody()}</main>
      <nav class="bar bar--mobile" aria-label="Navigering">${renderNav(
        state.view === 'day' ? state.day !== state.today : startOfWeek(state.day) !== startOfWeek(state.today),
      )}</nav>
      ${renderSheet()}`;
    window.scrollTo(0, scrollY);
    const sheet = root.querySelector<HTMLDialogElement>('#sheet');
    if (sheet && state.selectedId && !sheet.open) sheet.showModal();
    if (root.dataset.slide) {
      const stage = root.querySelector('#stage');
      stage?.classList.add(`slide-${root.dataset.slide}`);
      delete root.dataset.slide;
    }
  }

  // ---------- events ----------

  root.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) {
      // Click on the dialog backdrop closes it.
      const dlg = (e.target as HTMLElement).closest('dialog');
      if (dlg && e.target === dlg) closeSheet();
      return;
    }
    switch (target.dataset.action) {
      case 'prev':
        step(-1);
        break;
      case 'next':
        step(1);
        break;
      case 'today':
        go(state.view, state.today);
        break;
      case 'view':
        go(target.dataset.view as View, state.day);
        break;
      case 'goto-day':
        go('day', target.dataset.day!);
        break;
      case 'open':
        state.selectedId = target.dataset.id ?? null;
        render();
        break;
      case 'close':
        closeSheet();
        break;
      case 'refresh':
        void refresh();
        break;
      case 'reload':
        location.reload();
        break;
      case 'theme':
        state.theme = state.theme === 'auto' ? 'dark' : state.theme === 'dark' ? 'light' : 'auto';
        applyTheme();
        render();
        break;
    }
  });

  function closeSheet(): void {
    state.selectedId = null;
    root.querySelector<HTMLDialogElement>('#sheet')?.close();
    render();
  }

  root.addEventListener('close', (e) => {
    if ((e.target as HTMLElement).id === 'sheet' && state.selectedId) {
      state.selectedId = null;
      render();
    }
  });

  // Swipe between days/weeks (horizontal, one-handed).
  let swipe: { x: number; y: number; id: number } | null = null;
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('dialog')) return;
    swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  root.addEventListener('pointerup', (e) => {
    if (!swipe || swipe.id !== e.pointerId) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  });
  root.addEventListener('pointercancel', () => (swipe = null));

  document.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('dialog, input, textarea')) return;
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 't' || e.key === 'T') go(state.view, state.today);
    else if (e.key === 'd' || e.key === 'D') go('day', state.day);
    else if (e.key === 'v' || e.key === 'V') go('week', state.day);
  });

  window.addEventListener('popstate', () => {
    const r = readRoute();
    if (r) go(r.view, r.day, false);
  });

  window.addEventListener('online', () => {
    state.online = true;
    void refresh();
  });
  window.addEventListener('offline', () => {
    state.online = false;
    render();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    tick();
    if (!state.feed || Date.now() - state.feed.fetchedAt > STALE_MS) void refresh();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyTheme();
    render();
  });

  /** Advance the clock; roll "today" at midnight. */
  function tick(): void {
    state.now = new Date();
    const today = dayKey(state.now);
    if (today !== state.today) {
      const wasOnToday = state.day === state.today;
      state.today = today;
      if (wasOnToday) state.day = today;
    }
    render();
  }

  // ---------- start ----------

  applyTheme();
  const cached = readCache();
  if (cached) {
    state.feed = cached;
    parseFeed(state.day);
  }
  const route = readRoute();
  if (route) {
    state.view = route.view;
    state.day = route.day;
    ensureWindow();
  } else {
    history.replaceState(null, '', `#/dag/${state.day}`);
  }
  render();
  void refresh();
  setInterval(tick, 30_000);
  setInterval(() => void refresh(), REFRESH_MS);

  return { refresh, go, step };
}
