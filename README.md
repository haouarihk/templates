# haouarihk — a scroll-engineering portfolio

Six landing pages in one Qwik application — a personal portfolio demonstrating
custom scroll implementations. Each page belongs to a different industry and is
driven by a **different scroll toolset**, so the set reads as range rather than
one trick repeated.

Five of the six suppress native scrolling entirely and repaint the document with
a transform. The sixth deliberately does not — and says so.

| # | Route | Client / field | Scroll engine | Native scroll |
|---|-------|----------------|---------------|---------------|
| — | `/` | haouarihk — the portfolio itself | From-scratch `VirtualScroll` + live engine instrumentation | suppressed |
| 01 | `/atelier/` | Atelier Verrière — architecture | Lenis in transform mode + GSAP ScrollTrigger | suppressed |
| 02 | `/roast/` | Meridian Roasters — specialty coffee | `VirtualScroll` + Canvas 2D frame synthesis | suppressed |
| 03 | `/flux/` | FLUX — fashion | `VirtualScroll` + Three.js / GLSL displacement | suppressed |
| 04 | `/pulse/` | Pulse Festival — music & events | `VirtualScroll` + Matter.js + Motion One | suppressed |
| 05 | `/ledger/` | Ledger — fintech SaaS | Native CSS scroll-timelines, zero scroll JS | **untouched** |

## Running it

Needs Node 20.19+ (Vite 7's floor).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck, lint, and prerender all six routes to dist/
npm run serve      # serve the prerendered dist/ locally
npm run previews   # re-record the showcase card clips (needs a build first)
```

`npm run build` runs the static adapter, so `dist/` is flat HTML plus assets and
can be uploaded to any static host. There is no server requirement.

## Deployment

Live at **[templates.haouarihk.com](https://templates.haouarihk.com)**.

Every push to `main` runs `.github/workflows/deploy.yml`, which builds and
publishes `dist/` to GitHub Pages. The card clips ship committed under
`public/previews/`, so CI needs no browser or ffmpeg — re-recording stays a
local step.

`public/CNAME` holds the custom domain, and Vite copies it into `dist/`, so the
domain survives every deployment. The DNS side is a single `CNAME` record:

```
templates  CNAME  haouarihk.github.io
```

The sitemap origin lives in `adapters/static/vite.config.ts` — change it there
if the domain ever moves.

## Card previews

Each card in the showcase grid plays a short looping clip of its page being
scrolled. `scripts/capture-previews.mjs` records them from the real build:
it serves `dist/`, drives each page with wheel flicks in headless Chrome so the
page's own engine does the easing, and encodes an H.264 MP4 whose tail
crossfades into its head, so the loop has no visible cut. Output lands in
`public/previews/` (~250–400 KB per clip, plus a WebP poster).

Re-record after changing a page (`npm run build && npm run previews -- roast`
does just one). Each page's choreography (how far it travels, how hard it
flicks) is the `SHOTS` table at the top of the script.

On the showcase, clips load only when their card scrolls into view and pause
when it leaves. An "Autoplay previews" switch stops them all; it starts off
under `prefers-reduced-motion`, where hovering or focusing a card plays just
that one.

## The engine

`src/lib/virtual-scroll.ts` is the core: ~680 lines of dependency-free
TypeScript. Native scroll is switched off on the document, wheel / touch /
keyboard input is integrated into a `target`, and a `current` value chases it
each frame. Content is painted with `translate3d`, so the gap between the two
becomes `velocity` — the signal every downstream effect is driven by.

```ts
const engine = new VirtualScroll({ wrapper, content, ease: 0.1 });

engine.on((state) => {
  state.current;       // eased position, what you render with
  state.velocity;      // signed px/frame — the effects signal
  state.progress;      // 0..1
});

engine.scrollTo('#section', { offset: -20 });
engine.stop();         // for modals and intro sequences
engine.destroy();
```

Details that matter, and why:

- **Frame-rate independent damping.** A naive `current += (target - current) * 0.1`
  runs twice as fast on a 120Hz display. The engine uses exponential decay
  against real elapsed time instead, so the feel is identical everywhere.
- **The rAF loop parks itself** once scrolling settles, so an idle page costs
  nothing and a hidden tab costs less.
- **Wheel deltas are normalised** across all three `deltaMode` units browsers
  report in; touch carries real flick momentum.
- **Cached geometry.** Per-frame work is pure arithmetic — no `getBoundingClientRect`
  in any render loop.

## Accessibility

Hijacking scroll breaks things by default. Each is re-implemented rather than
abandoned:

- Arrow keys, PageUp/PageDown, Space, Home and End.
- A draggable synthetic scrollbar with a clickable track.
- `focusin` pulls keyboard-focused offscreen elements into view.
- Skip links on every page; `[data-vs-ignore]` opts a subtree back into native
  scrolling.
- **`prefers-reduced-motion` removes the engine entirely** and hands scrolling
  back to the browser — it does not merely shorten the animation. Every page has
  a verified fallback: the WebGL looks paint into the DOM, the drawing renders
  complete, the physics lineup becomes a plain list.

Measured CLS across the six prerendered pages: **0 – 0.015** (the "good"
threshold is 0.1).

## Rebranding

`src/lib/site.ts` is the single source of truth for the studio name, contact
details and the case-study registry. The showcase grid, cross-page navigation
and meta tags all read from it — changing a name or reordering the work is a
one-file edit.

Each case study owns its palette and typeface in its own `index.css`, scoped
with a namespace prefix (`kx-`, `at-`, `rt-`, `fx-`, `ps-`, `ld-`) so the six
brands never collide.

## Layout

```
src/
  lib/
    virtual-scroll.ts     the engine
    scroll-effects.ts     parallax, reveal, split text, easing helpers
    interactions.ts       magnetic elements, custom cursor
    site.ts               studio identity + case-study registry
  components/
    case-frame/           chrome shared by all five case studies
  routes/
    index.tsx             showcase
    atelier/ roast/ flux/ pulse/ ledger/
public/previews/          recorded card clips + posters
scripts/
  capture-previews.mjs    records public/previews/
adapters/static/          static site generation config
```
