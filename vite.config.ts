import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { handleSchedule } from './worker/index';

/**
 * Dev-only: serve the test fixture at /api/schedule.ics so `vite` works
 * without the Worker. `wrangler dev` (npm run preview) uses the real proxy.
 * Set VITE_FIXTURE=empty to see the empty-calendar state.
 * Set DEV_FEED_URL (in the gitignored .env.local) to proxy a real feed
 * instead, e.g. a local Plugga instance on http://localhost:3000.
 */
function fixtureFeed(feedUrl?: string): Plugin {
  return {
    name: 'schema-fixture-feed',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/schedule.ics')) return next();
        if (feedUrl) {
          // Same proxy code as production, so errors look the same in dev.
          const proxied = await handleSchedule({ SCHEDULE_FEED_URL: feedUrl });
          res.statusCode = proxied.status;
          proxied.headers.forEach((value, name) => res.setHeader(name, value));
          res.end(await proxied.text());
          return;
        }
        const mode = process.env.VITE_FIXTURE ?? 'full';
        if (mode === 'error') {
          res.statusCode = 502;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Simulerat fel' }));
          return;
        }
        if (mode === 'html') {
          res.statusCode = 200;
          res.setHeader('content-type', 'text/html');
          res.end('<!doctype html><title>Cloudflare Access</title><p>Login</p>');
          return;
        }
        const file = mode === 'empty' ? 'empty.ics' : 'schema.ics';
        const body = await readFile(fileURLToPath(new URL(`./test/fixtures/${file}`, import.meta.url)), 'utf8');
        res.setHeader('content-type', 'text/calendar; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(body);
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    fixtureFeed(loadEnv(mode, process.cwd(), '').DEV_FEED_URL),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        id: '/',
        name: 'Martins schema',
        short_name: 'Schema',
        description: 'Martins skolschema – dag och vecka',
        lang: 'sv-SE',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f1ea',
        theme_color: '#f4f1ea',
        categories: ['education', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell is precached; the ICS feed is cached by the app itself
        // (localStorage with a timestamp) so it can show "last updated".
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        // Never let the SW answer API or Cloudflare Access routes from cache.
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 4310, strictPort: true },
  build: { target: 'es2022', sourcemap: false },
}));
