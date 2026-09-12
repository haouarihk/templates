import {
  component$,
  useSignal,
  useStyles$,
  useVisibleTask$,
} from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

import styles from './index.css?inline';
import frameStyles from '../../components/case-frame/case-frame.css?inline';
import { CaseBar, CaseFooter } from '../../components/case-frame/case-frame';
import { bySlug } from '../../lib/site';
import { SECTION_LABELS, SECTION_PATHS, SECTION_STEPS } from './drawing';

const STUDY = bySlug('atelier')!;

const PROJECTS = [
  {
    no: '01',
    name: 'Verrière Saint-Just',
    place: 'Lyon, FR',
    year: '2019',
    program: 'Glass roof restoration',
    area: '1 240 m²',
    seed: 20719,
  },
  {
    no: '02',
    name: 'Maison Pierre-Blanche',
    place: 'Vaucluse, FR',
    year: '2021',
    program: 'Private house',
    area: '310 m²',
    seed: 88113,
  },
  {
    no: '03',
    name: 'Halle Textile',
    place: 'Roubaix, FR',
    year: '2022',
    program: 'Adaptive reuse',
    area: '4 800 m²',
    seed: 41277,
  },
  {
    no: '04',
    name: 'Pavillon Nord',
    place: 'Geneva, CH',
    year: '2023',
    program: 'Exhibition pavilion',
    area: '620 m²',
    seed: 66041,
  },
  {
    no: '05',
    name: 'Cloître Sainte-Marie',
    place: 'Arles, FR',
    year: '2024',
    program: 'Cloister & library',
    area: '1 900 m²',
    seed: 13509,
  },
];

/**
 * A procedural elevation. Seeded so server and client render byte-identical
 * markup, which keeps the panels stable through hydration and means the whole
 * gallery ships without a single image request.
 */
function facadeCells(seed: number) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const cols = 7;
  const rows = 9;
  const pad = 9;
  const gap = 2.2;
  const w = (100 - pad * 2 - gap * (cols - 1)) / cols;
  const h = 6.4;
  const step = h + 3.3;

  const cells: { x: number; y: number; w: number; h: number; o: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = rnd();
      if (v < 0.13) continue; // solid panel — no opening here
      cells.push({
        x: +(pad + c * (w + gap)).toFixed(2),
        y: +(24 + r * step).toFixed(2),
        w: +w.toFixed(2),
        h: +(v > 0.91 ? h * 2 + 3.3 : h).toFixed(2),
        o: +(0.14 + v * 0.5).toFixed(3),
      });
    }
  }
  return cells;
}

export default component$(() => {
  useStyles$(frameStyles);
  useStyles$(styles);

  const root = useSignal<HTMLDivElement>();
  const content = useSignal<HTMLDivElement>();
  const spacer = useSignal<HTMLDivElement>();
  const scene = useSignal<HTMLElement>();
  const sceneStage = useSignal<HTMLDivElement>();
  const gallery = useSignal<HTMLElement>();
  const galleryStage = useSignal<HTMLDivElement>();
  const track = useSignal<HTMLDivElement>();

  // Lenis and ScrollTrigger both need real layout and live input; neither has
  // any server-side meaning.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    async ({ cleanup }) => {
      const el = {
        root: root.value,
        content: content.value,
        spacer: spacer.value,
        scene: scene.value,
        sceneStage: sceneStage.value,
        gallery: gallery.value,
        galleryStage: galleryStage.value,
        track: track.value,
      };
      if (
        !el.root || !el.content || !el.spacer || !el.scene ||
        !el.sceneStage || !el.gallery || !el.galleryStage || !el.track
      ) {
        return;
      }

      // Reduced motion: no engine at all. The CSS fallback turns the fixed
      // layer back into an ordinary document and reveals the drawing complete.
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.root.dataset.native = 'true';
        return;
      }

      const [{ default: Lenis }, { gsap }, { ScrollTrigger }] =
        await Promise.all([
          import('lenis'),
          import('gsap'),
          import('gsap/ScrollTrigger'),
        ]);
      gsap.registerPlugin(ScrollTrigger);

      const clamp = (v: number, a: number, b: number) =>
        v < a ? a : v > b ? b : v;

      /**
       * Lenis drives the *document*, which scrolls nothing visible — the real
       * content is a fixed layer painted with a transform. Native scroll stays
       * the input device (so the scrollbar, keyboard and browser scroll
       * restoration all keep working) while the pixels are entirely ours.
       */
      const lenis = new Lenis({
        lerp: 0.085,
        wheelMultiplier: 1,
        respectReducedMotion: false, // handled above, explicitly
        autoRaf: false, // GSAP's ticker drives it, so the two never fight
      });

      // --- cached geometry, so the render loop never forces a reflow --------
      let sceneTop = 0;
      let sceneTotal = 0;
      let galTop = 0;
      let galTotal = 0;
      let galOverflow = 0;

      const measure = () => {
        const contentTop = el.content!.getBoundingClientRect().top;
        sceneTop = el.scene!.getBoundingClientRect().top - contentTop;
        sceneTotal = Math.max(0, el.scene!.offsetHeight - window.innerHeight);
        galTop = el.gallery!.getBoundingClientRect().top - contentTop;
        galTotal = Math.max(0, el.gallery!.offsetHeight - window.innerHeight);
        galOverflow = Math.max(0, el.track!.scrollWidth - window.innerWidth);
      };

      const layout = () => {
        // The gallery's height *is* its horizontal travel: one viewport to
        // hold the scene, plus however far the track has to move.
        const overflow = Math.max(0, el.track!.scrollWidth - window.innerWidth);
        el.gallery!.style.height = `${window.innerHeight + overflow}px`;
        // Only now is the content its final height, so the document spacer can
        // be sized to match it.
        el.spacer!.style.height = `${el.content!.getBoundingClientRect().height}px`;
        measure();
        lenis.resize();
        ScrollTrigger.refresh();
      };

      /**
       * Manual pinning. ScrollTrigger's own `pin` wants to mutate the DOM and
       * reason about a scroller we have deliberately taken out of service;
       * translating the stage against its section is both simpler and exactly
       * as accurate.
       */
      const pin = (
        stage: HTMLElement,
        top: number,
        total: number,
        scroll: number,
      ) => {
        const passed = clamp(scroll - top, 0, total);
        stage.style.transform = `translate3d(0,${passed}px,0)`;
        return total > 0 ? passed / total : 0;
      };

      const render = () => {
        const scroll = lenis.scroll;
        el.content!.style.transform = `translate3d(0,${-scroll}px,0)`;
        pin(el.sceneStage!, sceneTop, sceneTotal, scroll);
        const gp = pin(el.galleryStage!, galTop, galTotal, scroll);
        el.track!.style.transform = `translate3d(${-gp * galOverflow}px,0,0)`;
      };

      const offScroll = lenis.on('scroll', () => {
        render();
        ScrollTrigger.update();
      });
      cleanup(offScroll);

      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      cleanup(() => {
        gsap.ticker.remove(tick);
        lenis.destroy();
      });

      layout();
      render();

      const onResize = () => {
        layout();
        render();
      };
      window.addEventListener('resize', onResize);
      cleanup(() => window.removeEventListener('resize', onResize));
      document.fonts?.ready.then(onResize);

      // --- the pinned section drawing --------------------------------------
      const paths = gsap.utils.toArray<SVGPathElement>(
        '.at-scene__drawing path',
      );
      const labels = gsap.utils.toArray<SVGTextElement>(
        '.at-scene__drawing text',
      );
      gsap.set(paths, { strokeDasharray: 1, strokeDashoffset: 1 });
      gsap.set(labels, { opacity: 0 });

      const drawTl = gsap.timeline({
        scrollTrigger: {
          trigger: el.scene,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.5,
        },
      });
      drawTl
        .to(paths, {
          strokeDashoffset: 0,
          duration: 2,
          stagger: 0.3,
          ease: 'none',
        })
        .to(labels, { opacity: 1, duration: 1.4, stagger: 1, ease: 'none' }, '<40%');

      // Captions and the progress meter track the same scrub.
      const captions = Array.from(
        el.scene.querySelectorAll<HTMLElement>('.at-scene__caption span'),
      );
      const meter = el.scene.querySelector<HTMLElement>('.at-scene__meter i');
      const meterValue = el.scene.querySelector<HTMLElement>(
        '.at-scene__meter span',
      );

      ScrollTrigger.create({
        trigger: el.scene,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          const p = self.progress;
          meter?.style.setProperty('--p', p.toFixed(4));
          if (meterValue) {
            meterValue.textContent = `Section drawn — ${Math.round(p * 100)}%`;
          }
          let active = 0;
          SECTION_STEPS.forEach((step, i) => {
            if (p >= step.at) active = i;
          });
          captions.forEach((c, i) =>
            c.setAttribute('data-active', String(i === active)),
          );
        },
      });

      // --- hero drawing, on load -------------------------------------------
      const heroPaths = gsap.utils.toArray<SVGPathElement>(
        '.at-hero__draw path',
      );
      gsap.set(heroPaths, { strokeDasharray: 1, strokeDashoffset: 1 });
      gsap.to(heroPaths, {
        strokeDashoffset: 0,
        duration: 2.2,
        stagger: 0.06,
        ease: 'power2.inOut',
        delay: 0.25,
      });

      gsap.from('[data-at-intro]', {
        y: 40,
        opacity: 0,
        duration: 1.3,
        stagger: 0.09,
        ease: 'power3.out',
        delay: 0.15,
      });

      // --- generic reveals --------------------------------------------------
      gsap.utils.toArray<HTMLElement>('[data-at-reveal]').forEach((node) => {
        gsap.from(node, {
          y: 38,
          opacity: 0,
          duration: 1.1,
          ease: 'power3.out',
          scrollTrigger: { trigger: node, start: 'top 88%', once: true },
        });
      });

      cleanup(() => {
        ScrollTrigger.getAll().forEach((t) => t.kill());
        gsap.killTweensOf('*');
      });

      // Content height changes with fonts, images and wrapping.
      const ro = new ResizeObserver(() => onResize());
      ro.observe(el.content);
      cleanup(() => ro.disconnect());
    },
    { strategy: 'document-ready' },
  );

  return (
    <div class="at" ref={root}>
      <a class="skip-link" href="#at-main">
        Skip to content
      </a>
      <CaseBar study={STUDY} />

      <div class="at-viewport">
        <div class="at-content" ref={content}>
          <main id="at-main">
            {/* -------------------------------------------------- hero */}
            <section class="at-hero">
              <svg
                class="at-hero__draw"
                viewBox="0 0 1180 420"
                fill="none"
                aria-hidden="true"
              >
                <path d="M20 400 H1160" pathLength="1" />
                <path d="M110 400 V150" pathLength="1" />
                <path d="M1070 400 V150" pathLength="1" />
                <path d="M110 150 Q590 -10 1070 150" pathLength="1" />
                <path d="M150 150 Q590 25 1030 150" pathLength="1" />
                <path d="M245 108 V150" pathLength="1" />
                <path d="M400 78 V150" pathLength="1" />
                <path d="M590 68 V150" pathLength="1" />
                <path d="M780 78 V150" pathLength="1" />
                <path d="M935 108 V150" pathLength="1" />
                <path d="M110 276 H1070" pathLength="1" />
                <path d="M400 400 V276" pathLength="1" />
                <path d="M780 400 V276" pathLength="1" />
              </svg>

              <h1 class="at-hero__title" data-at-intro>
                Atelier
                <em>Verrière</em>
              </h1>

              <div class="at-hero__meta" data-at-intro>
                <span>Architecture &amp; spatial practice</span>
                <span>Lyon, France</span>
                <span>Est. 1998</span>
                <span>34 built works</span>
              </div>
            </section>

            {/* --------------------------------------------- statement */}
            <section class="at-section at-statement">
              <div class="at-label" data-at-reveal>
                01 — Practice
              </div>
              <p data-at-reveal>
                We work in <em>section</em> before we work in plan. Light,
                structure and the height of a room are decided together, or they
                are not decided at all.
              </p>
              <div class="at-statement__foot">
                <p data-at-reveal>
                  The studio was founded in 1998 around the restoration of a
                  single glazed hall in the third arrondissement. Twenty-six
                  years later the same question drives the work: how much
                  daylight can a structure carry before it stops being a
                  structure?
                </p>
                <p data-at-reveal>
                  Nine architects, two model-makers, one very large drawing
                  board. Every project is drawn by hand at 1:200 before it is
                  drawn anywhere else, and the section below is the first thing
                  a client is shown.
                </p>
                <p data-at-reveal>
                  Work spans restoration, adaptive reuse and new build across
                  France and Switzerland, with a standing interest in
                  nineteenth-century iron and glass.
                </p>
              </div>
            </section>

            {/* ------------------------------- pinned section drawing */}
            <section class="at-scene" ref={scene}>
              <div class="at-scene__stage" ref={sceneStage}>
                <div class="at-scene__head">
                  <span>02 — Verrière Saint-Just</span>
                  <span>Longitudinal section AA · 1:200</span>
                </div>

                <svg
                  class="at-scene__drawing"
                  viewBox="0 0 1400 760"
                  fill="none"
                  role="img"
                  aria-label="Longitudinal section through a nineteenth-century glazed hall, drawn progressively as the page scrolls."
                >
                  {SECTION_PATHS.map((p, i) => (
                    <path
                      key={i}
                      d={p.d}
                      pathLength="1"
                      data-weight={p.w}
                    />
                  ))}
                  {SECTION_LABELS.map((l) => (
                    <text
                      key={l.text}
                      x={l.x}
                      y={l.y}
                      text-anchor={l.anchor}
                    >
                      {l.text}
                    </text>
                  ))}
                </svg>

                <div class="at-scene__foot">
                  <div class="at-scene__caption">
                    {SECTION_STEPS.map((step, i) => (
                      <span key={step.title} data-active={i === 0}>
                        <b>{step.title}</b>
                        {step.body}
                      </span>
                    ))}
                  </div>
                  <div class="at-scene__meter">
                    <i />
                    <span>Section drawn — 0%</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ------------------------------- horizontal gallery */}
            <section class="at-gallery" ref={gallery}>
              <div class="at-gallery__stage" ref={galleryStage}>
                <div class="at-gallery__head">
                  <span>03 — Selected works</span>
                  <span>Scroll — the gallery runs sideways</span>
                </div>
                <div class="at-gallery__track" ref={track}>
                  {PROJECTS.map((p) => (
                    <article class="at-panel" key={p.no}>
                      <div class="at-panel__art">
                        <span class="at-panel__no">{p.no}</span>
                        <svg
                          viewBox="0 0 100 140"
                          preserveAspectRatio="xMidYMid slice"
                          aria-hidden="true"
                        >
                          <rect
                            x="6"
                            y="18"
                            width="88"
                            height="112"
                            fill="none"
                            stroke="currentColor"
                            stroke-opacity="0.2"
                            stroke-width="0.4"
                          />
                          <path
                            d="M6 18 L50 6 L94 18"
                            fill="none"
                            stroke="currentColor"
                            stroke-opacity="0.35"
                            stroke-width="0.5"
                          />
                          {facadeCells(p.seed).map((c, i) => (
                            <rect
                              key={i}
                              x={c.x}
                              y={c.y}
                              width={c.w}
                              height={c.h}
                              fill="currentColor"
                              fill-opacity={c.o}
                            />
                          ))}
                          <line
                            x1="0"
                            y1="130"
                            x2="100"
                            y2="130"
                            stroke="currentColor"
                            stroke-opacity="0.4"
                            stroke-width="0.5"
                          />
                        </svg>
                      </div>
                      <div class="at-panel__body">
                        <h3>{p.name}</h3>
                        <dl>
                          <dt>Place</dt>
                          <dd>{p.place}</dd>
                          <dt>Year</dt>
                          <dd>{p.year}</dd>
                          <dt>Program</dt>
                          <dd>{p.program}</dd>
                          <dt>Area</dt>
                          <dd>{p.area}</dd>
                        </dl>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            {/* ------------------------------------------- practice */}
            <section class="at-section">
              <div class="at-label" data-at-reveal>
                04 — The practice
              </div>
              <dl class="at-numbers">
                <div data-at-reveal>
                  <dt>Founded</dt>
                  <dd>
                    1998
                    <small>Lyon, third arrondissement. Still there.</small>
                  </dd>
                </div>
                <div data-at-reveal>
                  <dt>Built works</dt>
                  <dd>
                    34
                    <small>Across France and French-speaking Switzerland.</small>
                  </dd>
                </div>
                <div data-at-reveal>
                  <dt>Largest span</dt>
                  <dd>
                    42m
                    <small>
                      The Saint-Just verrière, restored without a central
                      support.
                    </small>
                  </dd>
                </div>
                <div data-at-reveal>
                  <dt>Studio</dt>
                  <dd>
                    9
                    <small>Architects, plus two full-time model-makers.</small>
                  </dd>
                </div>
              </dl>
            </section>

            <CaseFooter study={STUDY} />
          </main>
        </div>
      </div>

      {/* Gives the document the height the fixed layer no longer provides. */}
      <div class="at-spacer" ref={spacer} aria-hidden="true" />
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Atelier Verrière — Architecture & spatial practice',
  meta: [
    {
      name: 'description',
      content:
        'Case study: a pinned, self-drawing building section and a horizontal gallery, built on Lenis in transform mode with GSAP ScrollTrigger.',
    },
  ],
  links: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap',
    },
  ],
};
