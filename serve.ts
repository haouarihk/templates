/**
 * Bun static file server for the prerendered site in dist/.
 *
 * Every route is flat HTML plus client-side motion, so there is nothing to
 * render per-request — this only needs to map URLs to files, set cache headers,
 * and fall back to the prerendered 404 page.
 *
 *   bun serve.ts            # serves ./dist on :3000
 *   PORT=8080 bun serve.ts
 */
import { file, serve } from 'bun';
import { resolve, sep } from 'node:path';

const root = resolve(process.env.SITE_ROOT ?? 'dist');
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? '0.0.0.0';

// Hashed asset names, so they can never go stale behind a cache.
const IMMUTABLE = /^\/(assets|build)\//;
const immutable = 'public, max-age=31536000, immutable';
const revalidate = 'public, max-age=0, must-revalidate';

/** Resolve a URL path to a file inside root, or null if it escapes the root or is missing. */
async function pick(pathname: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const candidates = decoded.endsWith('/')
    ? [`${decoded}index.html`]
    : [decoded, `${decoded}.html`, `${decoded}/index.html`];

  for (const candidate of candidates) {
    const path = resolve(root, `.${candidate}`);
    // Path traversal guard: everything served must sit under root.
    if (path !== root && !path.startsWith(root + sep)) continue;
    const handle = file(path);
    if (await handle.exists()) return handle;
  }
  return null;
}

const server = serve({
  port,
  hostname,
  idleTimeout: 30,
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { allow: 'GET, HEAD' },
      });
    }

    const handle = await pick(pathname);
    if (handle) {
      return new Response(request.method === 'HEAD' ? null : handle, {
        headers: {
          'cache-control': IMMUTABLE.test(pathname) ? immutable : revalidate,
        },
      });
    }

    const notFound = file(resolve(root, '404.html'));
    if (await notFound.exists()) {
      return new Response(request.method === 'HEAD' ? null : notFound, {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Serving ${root} on http://${server.hostname}:${server.port}`);
