import { z } from 'zod';

/**
 * Cloudflare Worker: serves the built PWA as static assets and proxies the
 * upstream ICS feed on a same-origin route so the browser can fetch it
 * (the upstream sends no CORS headers). The upstream URL contains a secret
 * token and only ever lives in a Worker secret / .dev.vars.
 */

const EnvSchema = z.object({
  // https only, except a feed on this machine (local development).
  SCHEDULE_FEED_URL: z
    .string()
    .url()
    .refine(
      (u) => {
        if (!URL.canParse(u)) return false;
        const { protocol, hostname } = new URL(u);
        return protocol === 'https:' || (protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname));
      },
      { message: 'SCHEDULE_FEED_URL must be an https:// URL (http:// only for localhost)' },
    ),
});

export interface Env {
  SCHEDULE_FEED_URL?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

// Not exported: workerd rejects non-handler named exports from the entry module.
const SCHEDULE_PATH = '/api/schedule.ics';

const UPSTREAM_TIMEOUT_MS = 10_000;

export async function handleSchedule(env: unknown, fetcher: typeof fetch = fetch): Promise<Response> {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    return problem(500, 'SCHEDULE_FEED_URL saknas eller är ogiltig i Worker-miljön');
  }

  let upstream: Response;
  try {
    upstream = await fetcher(parsed.data.SCHEDULE_FEED_URL, {
      headers: { accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    return problem(502, `Kunde inte nå schemakällan: ${(err as Error).message}`);
  }

  if (!upstream.ok) {
    return problem(502, `Schemakällan svarade ${upstream.status}`);
  }

  const body = await upstream.text();
  if (!/^﻿?\s*BEGIN:VCALENDAR/i.test(body)) {
    return problem(502, 'Schemakällan svarade med något som inte är en kalender');
  }

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function problem(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === SCHEDULE_PATH) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return problem(405, 'Method not allowed');
      }
      return handleSchedule(env);
    }
    if (url.pathname.startsWith('/api/')) {
      return problem(404, 'Not found');
    }
    return env.ASSETS.fetch(request);
  },
};
