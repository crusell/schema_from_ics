import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import worker, { handleSchedule } from '../worker/index';

const fixture = readFileSync(new URL('./fixtures/schema.ics', import.meta.url), 'utf8');
const FEED = 'https://upstream.example/api/calendar/secret-token.ics';

function env(overrides: Record<string, unknown> = {}) {
  return {
    SCHEDULE_FEED_URL: FEED,
    ASSETS: { fetch: vi.fn(async () => new Response('<html>app</html>', { headers: { 'content-type': 'text/html' } })) },
    ...overrides,
  };
}

describe('handleSchedule', () => {
  it('accepts an http feed on localhost only', async () => {
    const fetcher = (async () => new Response('BEGIN:VCALENDAR\nEND:VCALENDAR')) as unknown as typeof fetch;
    const res = await handleSchedule({ SCHEDULE_FEED_URL: 'http://localhost:3000/api/calendar/x.ics' }, fetcher);
    expect(res.status).toBe(200);
  });

  it('proxies a valid calendar with no-store and text/calendar', async () => {
    const fetcher = vi.fn(async () => new Response(fixture, { headers: { 'content-type': 'text/calendar' } }));
    const res = await handleSchedule(env(), fetcher as unknown as typeof fetch);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe(fixture);
    expect(fetcher).toHaveBeenCalledWith(FEED, expect.objectContaining({ headers: expect.any(Object) }));
  });

  it('rejects a missing or invalid SCHEDULE_FEED_URL (zod)', async () => {
    const fetcher = vi.fn();
    for (const bad of [{}, { SCHEDULE_FEED_URL: 'not a url' }, { SCHEDULE_FEED_URL: 'http://insecure.example/x.ics' }]) {
      const res = await handleSchedule(bad, fetcher as unknown as typeof fetch);
      expect(res.status).toBe(500);
      expect((await res.json()).error).toMatch(/SCHEDULE_FEED_URL/);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns 502 when the upstream fails or is not a calendar', async () => {
    const html = vi.fn(async () => new Response('<!doctype html><title>Login</title>', { headers: { 'content-type': 'text/html' } }));
    expect((await handleSchedule(env(), html as unknown as typeof fetch)).status).toBe(502);

    const notOk = vi.fn(async () => new Response('nope', { status: 503 }));
    expect((await handleSchedule(env(), notOk as unknown as typeof fetch)).status).toBe(502);

    const throws = vi.fn(async () => {
      throw new Error('network down');
    });
    const res = await handleSchedule(env(), throws as unknown as typeof fetch);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('network down');
  });

  it('accepts a calendar with a BOM', async () => {
    const fetcher = vi.fn(async () => new Response('﻿' + fixture));
    expect((await handleSchedule(env(), fetcher as unknown as typeof fetch)).status).toBe(200);
  });
});

describe('worker fetch', () => {
  it('routes /api/schedule.ics to the proxy and everything else to assets', async () => {
    const e = env();
    const res = await worker.fetch(new Request('https://schema.example/'), e);
    expect(await res.text()).toBe('<html>app</html>');
    expect(e.ASSETS.fetch).toHaveBeenCalledTimes(1);

    const other = await worker.fetch(new Request('https://schema.example/api/other'), e);
    expect(other.status).toBe(404);

    const post = await worker.fetch(new Request('https://schema.example/api/schedule.ics', { method: 'POST' }), e);
    expect(post.status).toBe(405);
  });

  it('never leaks the upstream URL to the client', async () => {
    const fetcher = vi.fn(async () => new Response('<html>login</html>'));
    const res = await handleSchedule(env(), fetcher as unknown as typeof fetch);
    const body = await res.text();
    expect(body).not.toContain('secret-token');
    expect([...res.headers.values()].join(' ')).not.toContain('secret-token');
  });
});
