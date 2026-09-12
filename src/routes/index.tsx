import {
  component$,
  useSignal,
  useStyles$,
  useVisibleTask$,
} from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

import styles from './index.css?inline';
import { CASE_STUDIES, STUDIO } from '../lib/site';
import { VirtualScroll } from '../lib/virtual-scroll';
import { Parallax, clamp, createReveal, splitText } from '../lib/scroll-effects';
import { createCursor, magnetic } from '../lib/interactions';

export default component$(() => {
  useStyles$(styles);

  const wrapper = useSignal<HTMLDivElement>();
  const content = useSignal<HTMLDivElement>();
  const heroTitle = useSignal<HTMLHeadingElement>();
  const progress = useSignal<HTMLDivElement>();
  const nav = useSignal<HTMLElement>();
  const scope = useSignal<HTMLCanvasElement>();
  const previewToggle = useSignal<HTMLButtonElement>();

  // A scroll engine is inherently a client-side, post-paint concern: it needs
  // real layout measurements and live input. There is nothing here to resume.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    ({ cleanup }) => {
      if (!wrapper.value || !content.value) return;

      const engine = new VirtualScroll({
        wrapper: wrapper.value,
        content: content.value,
        ease: 0.11,
        wheelMultiplier: 1,
      });
      cleanup(() => engine.destroy());

      // --- text + reveal -------------------------------------------------
      const splits = Array.from(
        content.value.querySelectorAll<HTMLElement>('[data-split]'),
      );
      splits.forEach((el) => {
        splitText(el, (el.dataset.split as 'chars' | 'words') || 'words');
      });

      const reveal = createReveal(content.value);
      cleanup(() => reveal.destroy());

      // Hero copy animates on load rather than on intersection.
      const intro = requestAnimationFrame(() =>
        content.value
          ?.querySelectorAll('[data-intro]')
          .forEach((el) => el.classList.add('is-in')),
      );
      cleanup(() => cancelAnimationFrame(intro));

      // --- parallax ------------------------------------------------------
      const parallax = new Parallax(content.value);
      cleanup(() => parallax.destroy());

      // --- per-frame engine output --------------------------------------
      // Retract the nav while descending past the hero, restore it on the way
      // back up. Hysteresis on velocity, not raw direction, so a settling
      // frame near zero doesn't make it flicker.
      let navHidden = false;
      const offEngine = engine.on((state) => {
        if (progress.value) {
          progress.value.style.transform = `scaleX(${state.progress})`;
        }
        if (nav.value) {
          if (state.current < state.viewport * 0.5) navHidden = false;
          else if (state.velocity > 1.5) navHidden = true;
          else if (state.velocity < -1.5) navHidden = false;
          nav.value.dataset.hidden = String(navHidden);
        }
        // Velocity becomes a skew on the hero display type. This is the whole
        // trick: the gap between target and current, rendered as geometry.
        if (heroTitle.value) {
          const skew = clamp(state.velocity * 0.05, -5, 5);
          heroTitle.value.style.transform = `skewY(${skew.toFixed(3)}deg)`;
        }
        parallax.update(state.current, state.viewport);
      });
      cleanup(offEngine);

      const onResize = () => parallax.refresh(engine.state.current);
      window.addEventListener('resize', onResize);
      cleanup(() => window.removeEventListener('resize', onResize));
      // Fonts land after first paint and change every measurement.
      document.fonts?.ready.then(() => {
        parallax.refresh(engine.state.current);
        engine.measure();
      });

      // --- pointer polish ------------------------------------------------
      const cursor = createCursor();
      document.documentElement.classList.add('has-cursor');
      cleanup(() => {
        cursor.destroy();
        document.documentElement.classList.remove('has-cursor');
      });

      const magnets = Array.from(
        content.value.querySelectorAll<HTMLElement>('[data-magnetic]'),
      ).map((el) => magnetic(el, { strength: 0.28, radius: 2 }));
      cleanup(() => magnets.forEach((off) => off()));

      // --- in-page anchors ------------------------------------------------
      // Native anchor jumping does nothing once the document cannot scroll.
      const onClick = (e: MouseEvent) => {
        const link = (e.target as Element | null)?.closest<HTMLAnchorElement>(
          'a[href^="#"]',
        );
        if (!link) return;
        const id = link.getAttribute('href')!.slice(1);
        const el = document.getElementById(id);
        if (!el) return;
        e.preventDefault();
        engine.scrollTo(el, { offset: -20 });
        history.replaceState(null, '', `#${id}`);
      };
      document.addEventListener('click', onClick);
      cleanup(() => document.removeEventListener('click', onClick));

      // --- work previews ---------------------------------------------------
      // Each card's clip plays only while it is on screen. Looping motion that
      // starts by itself needs an off switch (WCAG 2.2.2), and reduced-motion
      // visitors start with it off — hovering or focusing a card still plays
      // that one, because then they asked for it.
      const videos = Array.from(
        content.value.querySelectorAll<HTMLVideoElement>('[data-preview]'),
      );
      const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
      let autoplay = !reduceMotion.matches;
      const onScreen = new Set<HTMLVideoElement>();
      const hovered = new Set<HTMLVideoElement>();

      const sync = (video: HTMLVideoElement) => {
        const wanted =
          !document.hidden &&
          (hovered.has(video) || (autoplay && onScreen.has(video)));
        if (wanted && video.paused) video.play().catch(() => {});
        else if (!wanted && !video.paused) video.pause();
      };
      const syncAll = () => videos.forEach(sync);

      const previewIo = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const video = entry.target as HTMLVideoElement;
            if (entry.isIntersecting) onScreen.add(video);
            else onScreen.delete(video);
            sync(video);
          }
        },
        { threshold: 0.2 },
      );
      const offHover = videos.map((video) => {
        // The attribute only sets the default; autoplay policy reads the property.
        video.muted = true;
        previewIo.observe(video);
        const card = video.closest<HTMLElement>('.kx-card')!;
        const enter = () => (hovered.add(video), sync(video));
        const leave = () => (hovered.delete(video), sync(video));
        card.addEventListener('pointerenter', enter);
        card.addEventListener('pointerleave', leave);
        card.addEventListener('focusin', enter);
        card.addEventListener('focusout', leave);
        return () => {
          card.removeEventListener('pointerenter', enter);
          card.removeEventListener('pointerleave', leave);
          card.removeEventListener('focusin', enter);
          card.removeEventListener('focusout', leave);
        };
      });
      cleanup(() => {
        previewIo.disconnect();
        offHover.forEach((off) => off());
      });

      const toggle = previewToggle.value;
      const setAutoplay = (on: boolean) => {
        autoplay = on;
        toggle?.setAttribute('aria-pressed', String(on));
        syncAll();
      };
      setAutoplay(autoplay);
      const onToggle = () => setAutoplay(!autoplay);
      toggle?.addEventListener('click', onToggle);
      cleanup(() => toggle?.removeEventListener('click', onToggle));

      document.addEventListener('visibilitychange', syncAll);
      cleanup(() => document.removeEventListener('visibilitychange', syncAll));

      // --- live instrument -------------------------------------------------
      // The page plotting its own engine. Velocity and the target/current gap
      // are the two numbers everything else on the site is derived from, so
      // showing them raw is the most honest demo we can give.
      const canvas = scope.value;
      const ctx = canvas?.getContext('2d') ?? null;
      const SAMPLES = 260;
      const vel: number[] = new Array(SAMPLES).fill(0);
      const gap: number[] = new Array(SAMPLES).fill(0);

      // Some readouts (velocity) appear in both the HUD and the scope bar, so
      // resolve every matching node once and write to all of them.
      const outs = new Map<string, HTMLElement[]>();
      for (const key of [
        'target',
        'current',
        'gap',
        'vel',
        'prog',
        'fps',
        'state',
      ]) {
        outs.set(
          key,
          Array.from(
            document.querySelectorAll<HTMLElement>(`[data-out="${key}"]`),
          ),
        );
      }
      const setOut = (key: string, value: string) => {
        const nodes = outs.get(key);
        if (!nodes) return;
        for (const node of nodes) node.textContent = value;
      };

      let dpr = 1;
      const sizeCanvas = () => {
        if (!canvas || !ctx) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      };
      sizeCanvas();
      window.addEventListener('resize', sizeCanvas);
      cleanup(() => window.removeEventListener('resize', sizeCanvas));

      const drawTrace = (
        data: number[],
        w: number,
        h: number,
        scale: number,
        color: string,
        width: number,
      ) => {
        if (!ctx) return;
        ctx.beginPath();
        ctx.lineWidth = width * dpr;
        ctx.strokeStyle = color;
        ctx.lineJoin = 'round';
        for (let i = 0; i < data.length; i++) {
          const x = (i / (data.length - 1)) * w;
          const y = h / 2 - clamp(data[i] / scale, -1, 1) * (h / 2 - 8 * dpr);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };

      const draw = () => {
        if (!canvas || !ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Zero axis.
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(236,233,226,0.16)';
        ctx.lineWidth = 1 * dpr;
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        drawTrace(gap, w, h, 320, 'rgba(236,233,226,0.32)', 1.25);
        drawTrace(vel, w, h, 45, '#ff4d17', 1.75);
      };

      let frames = 0;
      let fpsMark = performance.now();
      let fps = 60;
      let raf = 0;
      let scopeVisible = false;

      const instrument = () => {
        const s = engine.state;

        vel.push(s.velocity);
        vel.shift();
        gap.push(s.target - s.current);
        gap.shift();

        frames++;
        const now = performance.now();
        if (now - fpsMark >= 400) {
          fps = Math.round((frames * 1000) / (now - fpsMark));
          frames = 0;
          fpsMark = now;

          // Text updates are throttled; only transforms run every frame.
          const pad = (n: number, d = 0) =>
            n.toLocaleString('en-US', {
              minimumFractionDigits: d,
              maximumFractionDigits: d,
            });
          setOut('target', pad(s.target));
          setOut('current', pad(s.current));
          setOut('gap', pad(s.target - s.current, 1));
          setOut(
            'vel',
            `${s.velocity >= 0 ? '+' : ''}${pad(s.velocity, 1)}`,
          );
          setOut('prog', `${Math.round(s.progress * 100)}%`);
          setOut('fps', String(fps));
          setOut(
            'state',
            engine.isDisabled
              ? 'native (reduced motion)'
              : s.direction === 0
                ? 'settled'
                : s.direction > 0
                  ? 'forward'
                  : 'reverse',
          );
        }

        if (scopeVisible) draw();
        raf = requestAnimationFrame(instrument);
      };
      raf = requestAnimationFrame(instrument);
      cleanup(() => cancelAnimationFrame(raf));

      // Only rasterise the plot while it is on screen.
      let scopeIo: IntersectionObserver | undefined;
      if (canvas) {
        scopeIo = new IntersectionObserver(
          ([entry]) => {
            scopeVisible = entry.isIntersecting;
            if (scopeVisible) sizeCanvas();
          },
          { threshold: 0 },
        );
        scopeIo.observe(canvas);
        cleanup(() => scopeIo?.disconnect());
      }

      // Pause everything when the tab is hidden.
      const onVisibility = () => {
        if (document.hidden) cancelAnimationFrame(raf);
        else {
          fpsMark = performance.now();
          frames = 0;
          raf = requestAnimationFrame(instrument);
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      cleanup(() =>
        document.removeEventListener('visibilitychange', onVisibility),
      );
    },
    { strategy: 'document-ready' },
  );

  return (
    <div class="kx">
      <a class="skip-link" href="#work">
        Skip to the work
      </a>

      {/* Overlays live outside the transformed layer — `position: fixed`
          resolves against a transformed ancestor, not the viewport. */}
      <div class="kx-grain" aria-hidden="true" />

      <div class="kx-progress" aria-hidden="true">
        <div class="kx-progress__fill" ref={progress} />
      </div>

      <header class="kx-nav" ref={nav} data-hidden="false">
        <a href="#top" class="kx-nav__mark">
          {STUDIO.name}
        </a>
        <nav class="kx-nav__links" aria-label="Primary">
          <a href="#work">Work</a>
          <a href="#method">Method</a>
          <a href={`mailto:${STUDIO.email}`} class="kx-nav__contact">
            Contact
          </a>
        </nav>
      </header>

      <div class="kx-hud" aria-hidden="true">
        <div>
          <b>Progress</b>
          <span data-out="prog">0%</span>
        </div>
        <div>
          <b>Velocity</b>
          <span data-out="vel">+0.0</span>
        </div>
        <div>
          <b>Engine</b>
          <span data-out="state">settled</span>
        </div>
      </div>

      <div class="kx-vs-wrapper" data-vs-wrapper ref={wrapper}>
        <div ref={content}>
          <main id="top">
            {/* ------------------------------------------------ hero */}
            <section class="kx-hero">
              <div class="kx-hero__grid" aria-hidden="true" data-speed="0.06">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>

              <div class="kx-hero__eyebrow" data-reveal="fade" data-intro>
                <span>Interaction engineer</span>
                <span>{STUDIO.location}</span>
              </div>

              <h1 class="kx-hero__title" ref={heroTitle}>
                <span class="kx-hero__line" data-split="chars" data-intro>
                  Scroll,
                </span>
                <span
                  class="kx-hero__line kx-hero__line--serif"
                  data-split="chars"
                  data-intro
                >
                  rebuilt
                </span>
              </h1>

              <div class="kx-hero__foot">
                <p class="kx-hero__lede" data-reveal="fade" data-intro>
                  <strong>
                    Five landing pages. Five scroll engines, written from
                    scratch.
                  </strong>{' '}
                  Every page below suppresses the browser's own scrolling and
                  replaces it — so the scrollbar stops being plumbing and starts
                  being the interface.
                </p>
                <div class="kx-cue" data-reveal="fade" data-intro>
                  <i />
                  Scroll to begin
                </div>
              </div>
            </section>

            {/* ------------------------------------------- manifesto */}
            <section class="kx-section kx-manifesto">
              <div class="kx-label">01 — Position</div>
              <p data-split="words" data-reveal="fade">
                Most sites treat scrolling as plumbing. A number goes up,
                content moves, nobody thinks about it again.
              </p>
              <p data-split="words" data-reveal="fade">
                I treat it as the primary interface — the one gesture every
                visitor already knows, and the one almost nobody designs.
              </p>

              <dl class="kx-facts" data-reveal-group>
                <div data-reveal>
                  <dt>Engines built</dt>
                  <dd>
                    05
                    <small>
                      One per brief. No two pages share an implementation.
                    </small>
                  </dd>
                </div>
                <div data-reveal>
                  <dt>Core dependencies</dt>
                  <dd>
                    00
                    <small>
                      The engine powering this page is plain TypeScript. No
                      scroll library underneath it.
                    </small>
                  </dd>
                </div>
                <div data-reveal>
                  <dt>Accessibility floor</dt>
                  <dd>
                    AA
                    <small>
                      Keyboard, focus and reduced-motion handled before the
                      first effect is written.
                    </small>
                  </dd>
                </div>
              </dl>
            </section>

            {/* ------------------------------------------------ work */}
            <section class="kx-section kx-work" id="work">
              <div class="kx-work__head">
                <div class="kx-label">02 — Selected work</div>
                <button
                  type="button"
                  class="kx-previews"
                  ref={previewToggle}
                  aria-pressed="true"
                  data-cursor="hover"
                >
                  <i aria-hidden="true" />
                  Autoplay previews
                </button>
              </div>

              <ul class="kx-grid">
                {CASE_STUDIES.map((study) => (
                  <li key={study.slug}>
                    <a
                      class="kx-card"
                      href={`/${study.slug}/`}
                      style={{
                        '--card-accent': study.accent,
                        '--card-bg': study.bg,
                      }}
                      data-cursor="view"
                      data-cursor-text="Open case"
                      data-reveal
                    >
                      {/* Recorded from the real page by
                          scripts/capture-previews.mjs. Decorative: the card
                          text already says what it shows. */}
                      <span class="kx-card__media">
                        <video
                          data-preview
                          width={800}
                          height={500}
                          poster={`/previews/${study.slug}.webp`}
                          muted
                          loop
                          playsInline
                          preload="none"
                          disablePictureInPicture
                          aria-hidden="true"
                          tabIndex={-1}
                        >
                          <source
                            src={`/previews/${study.slug}.mp4`}
                            type="video/mp4"
                          />
                        </video>
                      </span>

                      <span class="kx-card__body">
                        <span class="kx-card__eyebrow">
                          <span>{study.index}</span>
                          <span>{study.field}</span>
                          <span class="kx-card__arrow" aria-hidden="true">
                            ↗
                          </span>
                        </span>

                        <span class="kx-card__title">{study.client}</span>

                        <span class="kx-card__summary">{study.summary}</span>

                        <span class="kx-card__meta">
                          <span
                            class={
                              study.engine === 'virtual'
                                ? 'kx-chip kx-chip--engine'
                                : 'kx-chip kx-chip--native'
                            }
                          >
                            {study.engine === 'virtual'
                              ? 'Virtual scroll'
                              : 'Native scroll'}
                          </span>
                          <span class="kx-card__stack">
                            {study.stack.join(' · ')}
                          </span>
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            {/* ---------------------------------------------- method */}
            <section class="kx-section kx-method" id="method">
              <div class="kx-label">03 — Method</div>
              <h2 class="kx-method__head" data-split="words" data-reveal="fade">
                Four steps. Everything else is decoration on top.
              </h2>

              <div class="kx-steps" data-reveal-group>
                <article class="kx-step" data-reveal>
                  <div class="kx-step__n">01 — Suppress</div>
                  <h3>Take the document out of it</h3>
                  <p>
                    <code>overflow: hidden</code> on the document, content moved
                    into a fixed layer. The browser now scrolls nothing.
                  </p>
                </article>
                <article class="kx-step" data-reveal>
                  <div class="kx-step__n">02 — Integrate</div>
                  <h3>Capture the real input</h3>
                  <p>
                    Wheel, touch and keyboard are normalised — including the
                    three <code>deltaMode</code> units browsers report in — and
                    summed into a single <code>target</code>.
                  </p>
                </article>
                <article class="kx-step" data-reveal>
                  <div class="kx-step__n">03 — Damp</div>
                  <h3>Let current chase target</h3>
                  <p>
                    Exponential decay against real elapsed time, not a fixed
                    per-frame fraction — so a 120Hz display feels identical to a
                    60Hz one instead of twice as fast.
                  </p>
                </article>
                <article class="kx-step" data-reveal>
                  <div class="kx-step__n">04 — Drive</div>
                  <h3>Spend the velocity</h3>
                  <p>
                    The gap between the two <em>is</em> the velocity. Feed it to
                    a skew, a shader uniform or a physics impulse and the page
                    reacts to how hard you threw it.
                  </p>
                </article>
              </div>

              {/* Live plot of this page's own engine. */}
              <figure class="kx-scope" data-reveal="fade">
                <figcaption class="kx-scope__bar">
                  <span class="visually-hidden">
                    Live readout of this page's scroll engine
                  </span>
                  <div>
                    Target <span data-out="target">0</span>px
                  </div>
                  <div>
                    Current <span data-out="current">0</span>px
                  </div>
                  <div>
                    Gap <em data-out="gap">0.0</em>px
                  </div>
                  <div>
                    Velocity <em data-out="vel">+0.0</em>
                  </div>
                  <div>
                    Frame <span data-out="fps">60</span>fps
                  </div>
                </figcaption>
                <canvas ref={scope} aria-hidden="true" />
                <div class="kx-scope__legend">
                  <span>
                    <i style="background:#ff4d17" />
                    Velocity — px per frame
                  </span>
                  <span>
                    <i style="background:rgba(236,233,226,0.32)" />
                    Gap — target minus current
                  </span>
                  <span>Scroll and watch it move.</span>
                </div>
              </figure>
            </section>

            {/* --------------------------------------- deliverables */}
            <section class="kx-section">
              <div class="kx-label">04 — What I hand over</div>
              <div class="kx-deliver" data-reveal-group>
                <article data-reveal>
                  <h3>A real accessibility story</h3>
                  <p>
                    Hijacked scroll breaks keyboard navigation, focus and
                    find-in-page by default. Every engine here re-implements
                    them: arrow and page keys, Home/End, a draggable scrollbar,
                    and focus that pulls offscreen elements into view.
                  </p>
                </article>
                <article data-reveal>
                  <h3>Reduced motion that means it</h3>
                  <p>
                    <code>prefers-reduced-motion</code> doesn't soften the
                    animation — it removes the engine entirely and hands
                    scrolling back to the browser. Vestibular triggers aren't a
                    styling preference.
                  </p>
                </article>
                <article data-reveal>
                  <h3>A frame budget</h3>
                  <p>
                    Transforms only, on compositor-friendly properties. The rAF
                    loop parks itself the moment scrolling settles, so an idle
                    page costs nothing and a background tab costs less.
                  </p>
                </article>
                <article data-reveal>
                  <h3>The judgement to not do it</h3>
                  <p>
                    Case 05 runs on untouched native scroll and CSS
                    scroll-timelines, because a fintech dashboard should feel
                    like the operating system. Knowing when to stop is part of
                    the deliverable.
                  </p>
                </article>
              </div>
            </section>

            {/* --------------------------------------------- contact */}
            <section class="kx-section kx-contact" id="contact">
              <div class="kx-contact__pre">Have a page worth scrolling?</div>
              <a
                class="kx-contact__link"
                href={`mailto:${STUDIO.email}`}
                data-magnetic
                data-cursor="hover"
              >
                Start a <em>project</em>
              </a>
            </section>

            <footer class="kx-footer">
              <span>
                © {new Date().getFullYear()} {STUDIO.name}
              </span>
              <span>{STUDIO.principal}</span>
              <span>{STUDIO.email}</span>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: `${STUDIO.name} — ${STUDIO.tagline}`,
  meta: [
    { name: 'description', content: STUDIO.description },
    { property: 'og:title', content: `${STUDIO.name} — ${STUDIO.tagline}` },
    { property: 'og:description', content: STUDIO.description },
  ],
};
