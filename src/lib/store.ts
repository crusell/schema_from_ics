/**
 * Fetches the ICS through the same-origin Worker proxy and keeps the last
 * good copy in localStorage so the app works offline and can say when the
 * data was last updated.
 */
export const FEED_PATH = '/api/schedule.ics';
const CACHE_KEY = 'schema:cache:v1';

export interface CachedFeed {
  ics: string;
  fetchedAt: number;
}

export type FeedErrorKind = 'offline' | 'not-ics' | 'http' | 'network';

export class FeedError extends Error {
  constructor(
    public kind: FeedErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'FeedError';
  }
}

export function readCache(storage: Storage = localStorage): CachedFeed | null {
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedFeed>;
    if (typeof parsed.ics !== 'string' || typeof parsed.fetchedAt !== 'number') return null;
    return { ics: parsed.ics, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

export function writeCache(feed: CachedFeed, storage: Storage = localStorage): void {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(feed));
  } catch {
    // Quota or private mode: offline support degrades gracefully.
  }
}

/** Fetch the feed. Throws FeedError; never returns non-ICS text. */
export async function fetchFeed(fetcher: typeof fetch = fetch): Promise<CachedFeed> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new FeedError('offline', 'Du är offline');
  }
  let res: Response;
  try {
    res = await fetcher(FEED_PATH, {
      cache: 'no-store',
      headers: { accept: 'text/calendar' },
      credentials: 'same-origin',
      // An expired Cloudflare Access session answers with a redirect to the
      // login page on another origin. Following it fails like a network
      // error, so stop at the redirect and report it as a login problem.
      redirect: 'manual',
    });
  } catch (err) {
    throw new FeedError('network', (err as Error).message || 'Nätverksfel');
  }
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400) || res.status === 401 || res.status === 403) {
    throw new FeedError('not-ics', 'Inloggningen har gått ut');
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = `Servern svarade ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* not JSON */
    }
    throw new FeedError('http', msg);
  }
  // A Cloudflare Access login page comes back as HTML with status 200.
  if (!/^﻿?\s*BEGIN:VCALENDAR/i.test(text)) {
    throw new FeedError('not-ics', 'Svaret var inte ett schema – sessionen kan ha gått ut');
  }
  return { ics: text, fetchedAt: Date.now() };
}
