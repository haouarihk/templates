import {
  component$,
  useSignal,
  useStyles$,
  useVisibleTask$,
  $,
} from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

import styles from './index.css?inline';
import frameStyles from '../../components/case-frame/case-frame.css?inline';
import { CaseBar, CaseFooter } from '../../components/case-frame/case-frame';
import { bySlug } from '../../lib/site';
import { VirtualScroll } from '../../lib/virtual-scroll';
import { clamp, createReveal } from '../../lib/scroll-effects';
import { createLabelTexture, createMipChain, drawBagFrame } from './bag';

const STUDY = bySlug('roast')!;

/** Copy panels, keyed to scrub progress through the rotation. */
const CHAPTERS = [
  {
    no: '01 — The lot',
    title: 'Guji, <em>Ethiopia</em>',
    body: 'Eighty-four smallholders around Hambela deliver cherry to a single washing station. We buy the whole day-lot or none of it, which is why there is only ever one Guji on the shelf at a time.',
    facts: [
      ['Producer', 'Hambela station'],
      ['Varietal', 'Heirloom'],
      ['Lot size', '18 bags'],
    ],
  },
  {
    no: '02 — Altitude',
    title: '1 950 <em>metres</em>',
    body: 'High enough that the cherry ripens slowly and the seed stays dense. Density is the whole argument: it survives a longer, gentler roast without going hollow in the cup.',
    facts: [
      ['Altitude', '1 950 masl'],
      ['Harvest', 'Nov — Jan'],
      ['Shade', '62% canopy'],
    ],
  },
  {
    no: '03 — Process',
    title: 'Washed, <em>36 hours</em>',
    body: 'Fermented under water for a day and a half, then dried on raised beds for eighteen days. Clean, deliberate, and unforgiving of a badly sorted lot — which is the point.',
    facts: [
      ['Method', 'Fully washed'],
      ['Fermentation', '36 h'],
      ['Drying', '18 days, raised bed'],
    ],
  },
  {
    no: '04 — In the cup',
    title: 'Peach, jasmine, <em>black tea</em>',
    body: 'Cupped at 8.7. Stone fruit up front, a floral middle that holds as it cools, and a dry black-tea finish that lasts far longer than it has any right to.',
    facts: [
      ['Score', '87.5 SCA'],
      ['Acidity', 'Malic, bright'],
      ['Body', 'Light — silken'],
    ],
  },
  {
    no: '05 — Freshness',
    title: 'Roasted <em>to order</em>',
    body: 'Nothing sits. We roast on Tuesday and Friday mornings and it leaves the same afternoon, with the roast date printed on the seam rather than a best-before eighteen months out.',
    facts: [
      ['Roasted', 'Tue & Fri'],
      ['Shipped', 'Same day'],
      ['Rest', '7 — 14 days'],
    ],
  },
];

const GRINDS = ['Whole bean', 'Filter', 'Espresso', 'Moka'];
const SIZES = [
  { label: '250 g', price: 18.5 },
  { label: '1 kg', price: 62 },
];

export default component$(() => {
  useStyles$(frameStyles);
  useStyles$(styles);

  const wrapper = useSignal<HTMLDivElement>();
  const content = useSignal<HTMLDivElement>();
  const scene = useSignal<HTMLElement>();
  const stage = useSignal<HTMLDivElement>();
  const canvas = useSignal<HTMLCanvasElement>();
  const progress = useSignal<HTMLDivElement>();

  const grind = useSignal(0);
  const size = useSignal(0);

  const select = $((which: 'grind' | 'size', i: number) => {
    if (which === 'grind') grind.value = i;
    else size.value = i;
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    ({ cleanup }) => {
      const els = {
        wrapper: wrapper.value,
        content: content.value,
        scene: scene.value,
        stage: stage.value,
        canvas: canvas.value,
      };
      if (
        !els.wrapper || !els.content || !els.scene || !els.stage || !els.canvas
      ) {
        return;
      }

      const engine = new VirtualScroll({
        wrapper: els.wrapper,
        content: els.content,
        ease: 0.1,
      });
      cleanup(() => engine.destroy());

      const reveal = createReveal(els.content);
      cleanup(() => reveal.destroy());

      // --- canvas sequence -------------------------------------------------
      const ctx = els.canvas.getContext('2d');
      let mips: HTMLCanvasElement[] | null = null;
      let cssW = 0;
      let cssH = 0;
      let lastAngle = Number.NaN;

      const sizeCanvas = () => {
        if (!ctx || !els.canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = els.canvas.getBoundingClientRect();
        cssW = rect.width;
        cssH = rect.height;
        els.canvas.width = Math.max(1, Math.round(cssW * dpr));
        els.canvas.height = Math.max(1, Math.round(cssH * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        lastAngle = Number.NaN; // force a redraw at the new size
      };

      const drawFrame = (angle: number) => {
        if (!ctx || !mips || cssW < 2 || cssH < 2) return;
        // Frames are cheap but not free; skip sub-perceptual deltas.
        if (Math.abs(angle - lastAngle) < 0.0015) return;
        lastAngle = angle;
        drawBagFrame(ctx, mips, cssW, cssH, angle);
      };

      // --- scene geometry, cached ------------------------------------------
      let sceneTop = 0;
      let sceneTotal = 0;

      const measure = () => {
        const contentTop = els.content!.getBoundingClientRect().top;
        sceneTop = els.scene!.getBoundingClientRect().top - contentTop;
        sceneTotal = Math.max(0, els.scene!.offsetHeight - window.innerHeight);
      };

      const chapters = Array.from(
        els.scene.querySelectorAll<HTMLElement>('.rt-chapter'),
      );
      const rail = els.scene.querySelector<HTMLElement>('.rt-readout__rail');
      const outAngle = els.scene.querySelector<HTMLElement>('[data-out="angle"]');
      const outFrame = els.scene.querySelector<HTMLElement>('[data-out="frame"]');
      const outFace = els.scene.querySelector<HTMLElement>('[data-out="face"]');

      const FACES = ['Front', 'Right', 'Back', 'Left'];
      /** Nominal frame count — what a downloaded sequence would have shipped. */
      const FRAMES = 240;

      const onFrame = (current: number) => {
        const passed = clamp(current - sceneTop, 0, sceneTotal);
        els.stage!.style.transform = `translate3d(0,${passed}px,0)`;
        const p = sceneTotal > 0 ? passed / sceneTotal : 0;

        // A full turn across the scene, offset so we open on a three-quarter
        // view rather than dead-on.
        const angle = p * Math.PI * 2 - 0.45;
        drawFrame(angle);

        const active = Math.min(
          CHAPTERS.length - 1,
          Math.floor(p * CHAPTERS.length + 0.0001),
        );
        chapters.forEach((c, i) =>
          c.setAttribute('data-active', String(i === active)),
        );

        rail?.style.setProperty('--p', p.toFixed(4));
        const deg = (((angle * 180) / Math.PI) % 360 + 360) % 360;
        if (outAngle) outAngle.textContent = `${deg.toFixed(0).padStart(3, '0')}°`;
        if (outFrame) {
          outFrame.textContent = `${String(Math.round(p * (FRAMES - 1)) + 1).padStart(3, '0')} / ${FRAMES}`;
        }
        if (outFace) {
          outFace.textContent = FACES[Math.round(deg / 90) % 4];
        }
      };

      const off = engine.on((state) => {
        if (progress.value) {
          progress.value.style.transform = `scaleX(${state.progress})`;
        }
        onFrame(state.current);
      });
      cleanup(off);

      const relayout = () => {
        measure();
        sizeCanvas();
        onFrame(engine.state.current);
      };

      // The label uses Fraunces and JetBrains Mono; building it before the
      // fonts land would bake fallback glyphs into the texture permanently.
      const buildTexture = () => {
        mips = createMipChain(createLabelTexture());
        lastAngle = Number.NaN;
        relayout();
      };
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => {
          buildTexture();
          engine.measure();
        });
      } else {
        buildTexture();
      }
      // Draw something immediately rather than waiting on the network.
      buildTexture();

      window.addEventListener('resize', relayout);
      cleanup(() => window.removeEventListener('resize', relayout));

      const ro = new ResizeObserver(() => relayout());
      ro.observe(els.content);
      cleanup(() => ro.disconnect());
    },
    { strategy: 'document-ready' },
  );

  const price = SIZES[size.value].price;

  return (
    <div class="rt">
      <a class="skip-link" href="#rt-main">
        Skip to content
      </a>
      <CaseBar study={STUDY} />

      <div class="rt-progress" aria-hidden="true">
        <div class="rt-progress__fill" ref={progress} />
      </div>

      <div data-vs-wrapper ref={wrapper}>
        <div ref={content}>
          <main id="rt-main">
            {/* -------------------------------------------------- hero */}
            <section class="rt-hero">
              <div class="rt-hero__top">
                <div>
                  <div class="rt-hero__eyebrow">
                    Single origin — lot 04 / 2026
                  </div>
                  <h1 class="rt-hero__title">
                    Meridian
                    <br />
                    <em>Roasters</em>
                  </h1>
                  <p class="rt-hero__lede">
                    One coffee at a time, bought whole-lot and roasted twice a
                    week in Lisbon. Scroll to turn the bag — the sequence below
                    is drawn frame by frame as you go, not downloaded.
                  </p>
                </div>

                <aside class="rt-hero__card">
                  <div class="rt-hero__card-label">Current lot</div>
                  <dl>
                    <dt>Origin</dt>
                    <dd>Guji, Ethiopia</dd>
                    <dt>Producer</dt>
                    <dd>Hambela</dd>
                    <dt>Process</dt>
                    <dd>Fully washed</dd>
                    <dt>Altitude</dt>
                    <dd>1 950 masl</dd>
                    <dt>Score</dt>
                    <dd>87.5 SCA</dd>
                    <dt>Roasted</dt>
                    <dd>04.09.2026</dd>
                  </dl>
                  <div class="rt-hero__card-foot">
                    <span>250 g — whole bean</span>
                    <strong>€18.50</strong>
                  </div>
                </aside>
              </div>
              <div class="rt-hero__foot">
                <span>Est. 2016 — Lisboa</span>
                <span>Direct trade</span>
                <span>Roasted Tue &amp; Fri</span>
                <span>Scroll ↓</span>
              </div>
            </section>

            {/* ------------------------------------- pinned product scene */}
            <section class="rt-scene" ref={scene}>
              <div class="rt-stage" ref={stage}>
                <div class="rt-stage__copy">
                  {CHAPTERS.map((ch, i) => (
                    <article
                      class="rt-chapter"
                      key={ch.no}
                      data-active={i === 0}
                    >
                      <div class="rt-chapter__no">{ch.no}</div>
                      <h2 dangerouslySetInnerHTML={ch.title} />
                      <p>{ch.body}</p>
                      <dl>
                        {ch.facts.map(([k, v]) => (
                          <>
                            <dt key={`${ch.no}-${k}-t`}>{k}</dt>
                            <dd key={`${ch.no}-${k}-d`}>{v}</dd>
                          </>
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>

                <div class="rt-stage__product">
                  <canvas
                    ref={canvas}
                    role="img"
                    aria-label="A 250 gram bag of Guji Ethiopia coffee, rotating as the page scrolls."
                  />
                </div>

                <div class="rt-readout">
                  <span>
                    Frame <b data-out="frame">001 / 240</b>
                  </span>
                  <span>
                    Rotation <b data-out="angle">000°</b>
                  </span>
                  <span>
                    Face <b data-out="face">Front</b>
                  </span>
                  <span class="rt-readout__rail">
                    <i />
                  </span>
                  <span>Synthesised, not downloaded</span>
                </div>
              </div>
            </section>

            {/* ------------------------------------------------- origin */}
            <section class="rt-section">
              <div class="rt-label" data-reveal="fade">
                06 — Origin
              </div>
              <div class="rt-origin">
                <h2 data-reveal>
                  We buy the <em>whole day-lot</em>, or we don't buy it.
                </h2>
                <div data-reveal>
                  <p>
                    Buying a fraction of a lot means the rest is blended away
                    into something anonymous, and the producer carries the risk
                    of the leftover. Taking the day's entire output costs more
                    and ties up the shelf, but it means the price we agree is
                    the price for everything, not just the cherry that graded
                    well.
                  </p>
                  <p>
                    It also means we run out. A lot lasts nine or ten weeks and
                    then it is genuinely gone, which we would rather explain
                    than work around.
                  </p>
                </div>
              </div>

              <dl class="rt-facts" data-reveal-group>
                <div data-reveal>
                  <dt>Paid to producer</dt>
                  <dd>€6.40/kg</dd>
                </div>
                <div data-reveal>
                  <dt>Above fairtrade floor</dt>
                  <dd>+118%</dd>
                </div>
                <div data-reveal>
                  <dt>Lots per year</dt>
                  <dd>Six</dd>
                </div>
                <div data-reveal>
                  <dt>Producers paid direct</dt>
                  <dd>84</dd>
                </div>
              </dl>
            </section>

            {/* ---------------------------------------------------- buy */}
            <section class="rt-section">
              <div class="rt-label" data-reveal="fade">
                07 — Take some home
              </div>
              <div class="rt-buy">
                <div data-reveal>
                  <div class="rt-buy__price">
                    €{price.toFixed(2)}
                    <small>
                      {SIZES[size.value].label} — {GRINDS[grind.value]}
                    </small>
                  </div>
                  <p class="rt-note">
                    Free shipping across the EU over €40. Subscriptions skip,
                    pause or cancel from the first email, without a form.
                  </p>
                </div>

                <div data-reveal>
                  <div class="rt-field">
                    <div class="rt-field__label" id="rt-size-label">
                      Size
                    </div>
                    <div class="rt-options" role="group" aria-labelledby="rt-size-label">
                      {SIZES.map((s, i) => (
                        <button
                          key={s.label}
                          type="button"
                          class="rt-option"
                          aria-pressed={size.value === i}
                          onClick$={() => select('size', i)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div class="rt-field">
                    <div class="rt-field__label" id="rt-grind-label">
                      Grind
                    </div>
                    <div class="rt-options" role="group" aria-labelledby="rt-grind-label">
                      {GRINDS.map((g, i) => (
                        <button
                          key={g}
                          type="button"
                          class="rt-option"
                          aria-pressed={grind.value === i}
                          onClick$={() => select('grind', i)}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button type="button" class="rt-cart">
                    Add to bag — €{price.toFixed(2)}
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </section>

            <CaseFooter study={STUDY} />
          </main>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Meridian Roasters — Guji, Ethiopia',
  meta: [
    {
      name: 'description',
      content:
        'Case study: a scroll-scrubbed product sequence rendered frame by frame in Canvas 2D, on a from-scratch virtual scroll engine.',
    },
  ],
  links: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&display=swap',
    },
  ],
};
