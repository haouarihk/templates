/**
 * Records the looping preview clip shown on each case-study card.
 *
 *   npm run build && npm run previews            # every case study
 *   npm run previews -- roast flux               # just these
 *
 * Serves the prerendered dist/ on a throwaway port, opens each page in Chrome,
 * and scrolls it with real wheel input in short flicks — so the page's own
 * scroll engine does the easing, exactly as a visitor would see it. Frames come
 * off the compositor via the DevTools screencast, then ffmpeg resamples them to
 * a constant rate and crossfades the tail into the head so the clip loops
 * without a visible cut.
 *
 * Output: public/previews/<slug>.mp4 (H.264, muted) + <slug>.webp (poster, the
 * clip's first frame, so there is no jump when playback starts).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'public', 'previews');

/** Recorded at desktop size, delivered at card size (2× a ~400px card). */
const VIEWPORT = { width: 1280, height: 800 };
const OUTPUT_WIDTH = 800;
const FPS = 30;
/** Seconds of tail blended into the head to hide the loop point. */
const LOOP_BLEND = 0.6;

/**
 * Per-page choreography. `distance` is how far down the page the preview
 * travels — enough to reach each page's signature moment — split across
 * `flicks` wheel gestures with `pause` ms between them for the easing to show.
 */
const SHOTS = {
  atelier: { distance: 5200, flicks: 6, pause: 750 }, // drawing assembles → horizontal gallery
  roast: { distance: 3400, flicks: 5, pause: 850 }, // the bag turns
  flux: { distance: 3600, flicks: 4, pause: 1000, force: 1.5 }, // hard throws tear the shader
  pulse: { distance: 3600, flicks: 4, pause: 850 }, // names pile up in the physics well
  // Native scroll: headless Chrome applies each wheel delta instantly, so the
  // OS momentum a visitor would see is played back in-page instead.
  ledger: { distance: 3200, flicks: 5, pause: 450, native: true },
};

// ---------------------------------------------------------------- server

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
};

function serve(dir) {
  const server = http.createServer((req, res) => {
    let file = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(dir)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// --------------------------------------------------------------- capture

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One trackpad-style gesture: a burst of wheel deltas that decays, the way a
 * real flick arrives. Small, frequent deltas also make native scroll (Ledger)
 * glide instead of jumping.
 */
async function flick(page, px, force = 1, native = false) {
  if (native) {
    // Momentum curve, not a linear tween — decelerates like a trackpad throw.
    return page.evaluate(
      (px) =>
        new Promise((done) => {
          const y0 = window.scrollY;
          const t0 = performance.now();
          const step = (now) => {
            const t = Math.min((now - t0) / 1100, 1);
            window.scrollTo(0, y0 + px * (1 - (1 - t) ** 4));
            if (t < 1) requestAnimationFrame(step);
            else done();
          };
          requestAnimationFrame(step);
        }),
      px,
    );
  }
  const steps = 14;
  // Geometric decay, normalised so the deltas sum to `px`.
  const r = 0.82;
  const norm = (1 - r) / (1 - r ** steps);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px * norm * r ** i);
    await wait(22 / force);
  }
}

async function record(browser, origin, slug, shot) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await page.goto(`${origin}/${slug}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Pointer somewhere neutral; wheel input needs a position to dispatch from.
  await page.mouse.move(VIEWPORT.width * 0.7, VIEWPORT.height * 0.55);
  // Let the intro animation finish so the clip opens on a settled hero.
  await wait(2800);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `preview-${slug}-`));
  const frames = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = path.join(tmp, `${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });

  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
  });
  const start = Date.now() / 1000;

  // A beat on the hero. The first LOOP_BLEND seconds become the crossfade, so
  // this is what's left of the hold once the clip loops.
  await wait(1300);
  const per = shot.distance / shot.flicks;
  for (let i = 0; i < shot.flicks; i++) {
    await flick(page, per, shot.force, shot.native);
    await wait(shot.pause);
  }
  await wait(400);

  const end = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await page.close();

  if (frames.length < 10) throw new Error(`${slug}: only ${frames.length} frames captured`);

  // The screencast only emits on damage, so a frame's duration is the gap to
  // the next one. On a still hero the first frame may not arrive until the
  // first flick — it's still what was on screen, so it holds from `start`.
  // (Frame timestamps are epoch seconds, same clock as ours.)
  const length = end - start;
  const at = (i) => (i === 0 ? 0 : Math.min(Math.max(frames[i].t - start, 0), length));
  const list = frames
    .map((f, i) => {
      const next = i + 1 < frames.length ? at(i + 1) : length;
      return `file '${f.file}'\nduration ${Math.max(next - at(i), 0.001).toFixed(4)}`;
    })
    .join('\n');
  // concat demuxer ignores the last duration unless the file is repeated.
  fs.writeFileSync(path.join(tmp, 'list.txt'), `${list}\nfile '${frames.at(-1).file}'\n`);

  return { tmp, length, count: frames.length };
}

// ---------------------------------------------------------------- encode

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-2000)))));
  });
}

async function encode(slug, { tmp, length }) {
  const mp4 = path.join(OUT, `${slug}.mp4`);
  const poster = path.join(OUT, `${slug}.webp`);
  const d = LOOP_BLEND;
  const body = length - d; // clip without its first `d` seconds
  // Output = clip[d..end] with its last `d` seconds crossfaded into clip[0..d].
  // It therefore starts and ends on the same frame: a seamless loop.
  const graph = [
    `[0:v]fps=${FPS},scale=${OUTPUT_WIDTH}:-2:flags=lanczos:out_range=tv,format=yuv420p,split[a][b]`,
    // xfade insists on a declared constant rate; trim drops it, so restate it.
    `[a]trim=start=${d},setpts=PTS-STARTPTS,fps=${FPS}[body]`,
    `[b]trim=end=${d},setpts=PTS-STARTPTS,fps=${FPS}[head]`,
    `[body][head]xfade=transition=fade:duration=${d}:offset=${(body - d).toFixed(3)},format=yuv420p[v]`,
  ].join(';');

  await run([
    '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'),
    '-filter_complex', graph, '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-profile:v', 'high',
    '-movflags', '+faststart', '-an', mp4,
  ]);
  await run(['-y', '-i', mp4, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', poster]);

  fs.rmSync(tmp, { recursive: true, force: true });
  return { mp4, poster };
}

// ------------------------------------------------------------------ main

const only = process.argv.slice(2);
const slugs = only.length ? only : Object.keys(SHOTS);
for (const slug of slugs) {
  if (!SHOTS[slug]) throw new Error(`No shot defined for "${slug}"`);
  if (!fs.existsSync(path.join(DIST, slug, 'index.html'))) {
    throw new Error(`dist/${slug}/ missing — run \`npm run build\` first`);
  }
}
fs.mkdirSync(OUT, { recursive: true });

const server = await serve(DIST);
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  // System Chrome if present, else Playwright's own Chromium.
  channel: process.env.PREVIEW_BROWSER ?? 'chrome',
  // Software WebGL, so the FLUX shader renders on GPU-less machines too.
  args: ['--enable-unsafe-swiftshader', '--hide-scrollbars'],
});

try {
  for (const slug of slugs) {
    const clip = await record(browser, origin, slug, SHOTS[slug]);
    const { mp4 } = await encode(slug, clip);
    const kb = (fs.statSync(mp4).size / 1024).toFixed(0);
    console.log(
      `${slug.padEnd(8)} ${clip.count} frames · ${(clip.length - LOOP_BLEND).toFixed(1)}s loop · ${kb} KB`,
    );
  }
} finally {
  await browser.close();
  server.close();
}
