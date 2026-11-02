import { describe, expect, it } from 'vitest';
import { FeedError, fetchFeed } from '../src/lib/store';

function fake(res: Partial<Response>): typeof fetch {
  return (async () => ({ ok: false, status: 200, type: 'basic', text: async () => '', ...res }) as Response) as typeof fetch;
}

async function errorKind(fetcher: typeof fetch): Promise<string> {
  try {
    await fetchFeed(fetcher);
    return 'no error';
  } catch (err) {
    return (err as FeedError).kind;
  }
}

describe('fetchFeed', () => {
  it('returns the calendar text', async () => {
    const feed = await fetchFeed(fake({ ok: true, text: async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR' }));
    expect(feed.ics).toContain('BEGIN:VCALENDAR');
  });

  it('reports an expired Access session (redirect to login) as a login problem, not as offline', async () => {
    expect(await errorKind(fake({ type: 'opaqueredirect', status: 0 }))).toBe('not-ics');
    expect(await errorKind(fake({ status: 302 }))).toBe('not-ics');
    expect(await errorKind(fake({ status: 403 }))).toBe('not-ics');
  });

  it('reports an HTML page with status 200 as not a calendar', async () => {
    expect(await errorKind(fake({ ok: true, text: async () => '<!doctype html>' }))).toBe('not-ics');
  });

  it('reports a proxy error as http', async () => {
    expect(await errorKind(fake({ status: 502, text: async () => '{"error":"x"}' }))).toBe('http');
  });
});
