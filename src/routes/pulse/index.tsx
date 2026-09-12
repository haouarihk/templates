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
import { VirtualScroll } from '../../lib/virtual-scroll';

const STUDY = bySlug('pulse')!;

const LINEUP = [
  { name: 'Four Tet', headline: true },
  { name: 'Jamie xx', headline: true },
  { name: 'Floating Points', headline: true },
  { name: 'Helena Hauff', headline: false },
  { name: 'Overmono', headline: false },
  { name: 'Bicep', headline: false },
  { name: 'Kelly Lee Owens', headline: false },
  { name: 'DJ Koze', headline: false },
  { name: 'Nala Sinephro', headline: false },
  { name: 'Shygirl', headline: false },
  { name: 'Joy Orbison', headline: false },
  { name: 'Yaeji', headline: false },
  { name: 'Lorraine James', headline: false },
  { name: 'SPFDJ', headline: false },
  { name: 'Anz', headline: false },
  { name: 'Sault', headline: false },
];

const DAYS = [
  {
    day: 'Friday',
    date: '12 June',
    acts: [
      ['20:00', 'Anz'],
      ['21:30', 'Overmono'],
      ['23:00', 'Four Tet'],
      ['01:00', 'SPFDJ'],
    ],
  },
  {
    day: 'Saturday',
    date: '13 June',
    acts: [
      ['19:30', 'Nala Sinephro'],
      ['21:00', 'Yaeji'],
      ['22:30', 'Jamie xx'],
      ['00:30', 'Helena Hauff'],
    ],
  },
  {
    day: 'Sunday',
    date: '14 June',
    acts: [
      ['19:00', 'Lorraine James'],
      ['20:30', 'Shygirl'],
      ['22:00', 'Floating Points'],
      ['23:45', 'DJ Koze'],
    ],
  },
];

const TIERS = [
  {
    name: 'Day pass',
    price: '€68',
    note: 'One day, in and out all evening. Choose the day at checkout.',
    best: false,
  },
  {
    name: 'Full weekend',
    price: '€165',
    note: 'All three days, priority entry before 21:00, and the printed programme.',
    best: true,
  },
  {
    name: 'Weekend + camping',
    price: '€215',
    note: 'Everything above, plus a pitch in the north field and showers that work.',
    best: false,
  },
];

export default component$(() => {
  useStyles$(frameStyles);
  useStyles$(styles);

  const root = useSignal<HTMLDivElement>();
  const wrapper = useSignal<HTMLDivElement>();
  const content = useSignal<HTMLDivElement>();
  const scene = useSignal<HTMLElement>();
  const stage = useSignal<HTMLDivElement>();
  const arena = useSignal<HTMLUListElement>();

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    async ({ cleanup }) => {
      const el = {
        root: root.value,
        wrapper: wrapper.value,
        content: content.value,
        scene: scene.value,
        stage: stage.value,
        arena: arena.value,
      };
      if (
        !el.root || !el.wrapper || !el.content ||
        !el.scene || !el.stage || !el.arena
      ) {
        return;
      }

      const engine = new VirtualScroll({
        wrapper: el.wrapper,
        content: el.content,
        ease: 0.1,
      });
      cleanup(() => engine.destroy());

      // The engine owns the reduced-motion decision and restores native
      // scrolling; the CSS fallback lays the lineup out as a plain list.
      if (engine.isDisabled) {
        el.root.dataset.native = 'true';
        return;
      }

      const [M, motion] = await Promise.all([
        import('matter-js'),
        import('motion'),
      ]);

      const clamp = (v: number, a: number, b: number) =>
        v < a ? a : v > b ? b : v;

      // ---------------------------------------------------------- Matter
      const world = M.Engine.create({ enableSleeping: false });
      world.gravity.y = 1;

      const pills = Array.from(
        el.arena.querySelectorAll<HTMLElement>('.ps-pill'),
      );

      interface Item {
        el: HTMLElement;
        body: import('matter-js').Body;
        w: number;
        h: number;
        dropX: number;
        threshold: number;
        live: boolean;
      }

      let items: Item[] = [];
      let walls: import('matter-js').Body[] = [];
      let arenaW = 0;
      let arenaH = 0;

      const buildWorld = () => {
        M.Composite.clear(world.world, false);
        walls = [];
        items = [];

        const rect = el.arena!.getBoundingClientRect();
        arenaW = rect.width;
        arenaH = rect.height;
        if (arenaW < 2 || arenaH < 2) return;

        const wallOpts = { isStatic: true, restitution: 0.15, friction: 0.6 };
        walls = [
          // floor
          M.Bodies.rectangle(arenaW / 2, arenaH + 40, arenaW + 400, 80, wallOpts),
          // left / right
          M.Bodies.rectangle(-40, arenaH / 2, 80, arenaH * 4, wallOpts),
          M.Bodies.rectangle(arenaW + 40, arenaH / 2, 80, arenaH * 4, wallOpts),
          /**
           * Ceiling, sitting just above the arena. A hard throw launches the
           * whole pile, and without this the bodies sail over the fixed page
           * chrome. Its underside is at y = -60, so bodies stay roughly within
           * the arena while still overshooting its top edge visibly.
           */
          M.Bodies.rectangle(arenaW / 2, -100, arenaW + 400, 80, wallOpts),
        ];
        M.Composite.add(world.world, walls);

        pills.forEach((node, i) => {
          const w = node.offsetWidth;
          const h = node.offsetHeight;
          // Deterministic scatter, so a resize doesn't reshuffle the pile.
          const t = (i * 0.6180339887) % 1;
          const dropX = clamp(
            w / 2 + 20 + t * Math.max(1, arenaW - w - 40),
            w / 2 + 8,
            arenaW - w / 2 - 8,
          );
          const body = M.Bodies.rectangle(dropX, -20, w, h, {
            restitution: 0.36,
            friction: 0.42,
            frictionAir: 0.014,
            chamfer: { radius: Math.min(h / 2, w / 2) },
          });
          items.push({
            el: node,
            body,
            w,
            h,
            dropX,
            // Released across the first two-thirds; the rest of the scene is
            // for shaking what has already landed.
            threshold: (i / pills.length) * 0.66 + 0.02,
            live: false,
          });
        });
      };

      const syncDom = () => {
        for (const it of items) {
          if (!it.live) continue;
          const x = it.body.position.x - it.w / 2;
          const y = it.body.position.y - it.h / 2;
          it.el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${it.body.angle.toFixed(4)}rad)`;
        }
      };

      // ------------------------------------------------- physics ticking
      let raf = 0;
      let stageVisible = false;

      const kineticEnergy = () =>
        items.reduce(
          (sum, it) =>
            it.live
              ? sum +
                Math.abs(it.body.velocity.x) +
                Math.abs(it.body.velocity.y) +
                Math.abs(it.body.angularVelocity) * 12
              : sum,
          0,
        );

      const step = () => {
        M.Engine.update(world, 1000 / 60);
        syncDom();
        // Park the simulation once the pile has settled; a static pile costs
        // nothing until the next scroll disturbs it.
        raf = stageVisible && kineticEnergy() > 0.14
          ? requestAnimationFrame(step)
          : 0;
      };

      const wake = () => {
        if (!raf && stageVisible) raf = requestAnimationFrame(step);
      };
      cleanup(() => cancelAnimationFrame(raf));

      const io = new IntersectionObserver(
        ([entry]) => {
          stageVisible = entry.isIntersecting;
          if (stageVisible) wake();
        },
        { threshold: 0 },
      );
      io.observe(el.stage);
      cleanup(() => io.disconnect());

      // ------------------------------------------------------- geometry
      let sceneTop = 0;
      let sceneTotal = 0;

      const measure = () => {
        const contentTop = el.content!.getBoundingClientRect().top;
        sceneTop = el.scene!.getBoundingClientRect().top - contentTop;
        sceneTotal = Math.max(0, el.scene!.offsetHeight - window.innerHeight);
      };

      const outLive = el.scene.querySelector<HTMLElement>('[data-ps="live"]');
      const outVel = el.scene.querySelector<HTMLElement>('[data-ps="vel"]');
      const outG = el.scene.querySelector<HTMLElement>('[data-ps="g"]');
      let textTick = 0;

      const onFrame = (current: number, velocity: number) => {
        const passed = clamp(current - sceneTop, 0, sceneTotal);
        el.stage!.style.transform = `translate3d(0,${passed}px,0)`;
        const p = sceneTotal > 0 ? passed / sceneTotal : 0;

        // Release and retract bodies as the scene is scrubbed, so the scene
        // plays backwards as cleanly as it plays forwards.
        for (const it of items) {
          if (!it.live && p >= it.threshold) {
            it.live = true;
            // Below the ceiling's underside, so a released body never spawns
            // inside it.
            M.Body.setPosition(it.body, { x: it.dropX, y: -20 });
            M.Body.setVelocity(it.body, { x: 0, y: 7 });
            M.Body.setAngularVelocity(it.body, 0);
            M.Body.setAngle(it.body, 0);
            M.Composite.add(world.world, it.body);
            it.el.dataset.live = 'true';
            wake();
          } else if (it.live && p < it.threshold - 0.03) {
            it.live = false;
            M.Composite.remove(world.world, it.body);
            it.el.dataset.live = 'false';
          }
        }

        /**
         * The page's velocity becomes the world's. Scrolling down pushes the
         * bodies up, the way loose objects lag behind an accelerating lift —
         * which is the whole point: the pile reacts to how hard you threw it,
         * not merely to where you are.
         */
        const v = clamp(velocity, -60, 60);
        if (Math.abs(v) > 0.4) {
          for (const it of items) {
            if (!it.live) continue;
            M.Body.applyForce(it.body, it.body.position, {
              x: (Math.random() - 0.5) * 0.00004 * it.body.mass,
              y: -v * 0.00004 * it.body.mass,
            });
          }
          wake();
        }

        if (++textTick % 6 === 0) {
          const liveCount = items.filter((i) => i.live).length;
          if (outLive) outLive.textContent = `${liveCount} / ${items.length}`;
          if (outVel) {
            outVel.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
          }
          if (outG) outG.textContent = `${(1 + -v * 0.04).toFixed(2)} g`;
        }
      };

      const off = engine.on((state) => onFrame(state.current, state.velocity));
      cleanup(off);

      const relayout = () => {
        measure();
        buildWorld();
        // Re-release whatever should already be on stage at this position.
        onFrame(engine.state.current, 0);
        wake();
      };

      relayout();

      window.addEventListener('resize', relayout);
      cleanup(() => window.removeEventListener('resize', relayout));
      document.fonts?.ready.then(() => {
        engine.measure();
        relayout();
      });

      // --------------------------------------------------- Motion One
      const { animate, inView, stagger } = motion;

      animate(
        '.ps-hero__mark i',
        { transform: ['translateY(108%)', 'translateY(0%)'] },
        { duration: 1.1, delay: stagger(0.09), ease: [0.16, 1, 0.3, 1] },
      );
      animate(
        '.ps-hero__kicker, .ps-hero__meta',
        { opacity: [0, 1], transform: ['translateY(18px)', 'translateY(0px)'] },
        { duration: 0.9, delay: stagger(0.12, { startDelay: 0.35 }), ease: [0.16, 1, 0.3, 1] },
      );

      const stopInView = inView(
        '[data-ps-reveal]',
        (target) => {
          animate(
            target,
            { opacity: [0, 1], transform: ['translateY(26px)', 'translateY(0px)'] },
            { duration: 0.85, ease: [0.16, 1, 0.3, 1] },
          );
        },
        { margin: '0px 0px -12% 0px' },
      );
      cleanup(() => stopInView());
    },
    { strategy: 'document-ready' },
  );

  return (
    <div class="ps" ref={root}>
      <a class="skip-link" href="#ps-main">
        Skip to content
      </a>
      <CaseBar study={STUDY} />
      <div class="ps-aura" aria-hidden="true" />

      <div data-vs-wrapper ref={wrapper}>
        <div ref={content}>
          <main id="ps-main">
            {/* -------------------------------------------------- hero */}
            <section class="ps-hero">
              <div class="ps-hero__kicker">
                <span>12 — 14 June 2026</span>
                <span>Parc de la Villette, Paris</span>
                <span>Third edition</span>
              </div>
              <h1 class="ps-hero__mark">
                <span>
                  <i>Pulse</i>
                </span>
                <span>
                  <i>
                    <em>Festival</em>
                  </i>
                </span>
              </h1>
              <div class="ps-hero__meta">
                <span>16 artists</span>
                <span>Three stages</span>
                <span>Scroll hard ↓</span>
              </div>
            </section>

            {/* ------------------------------------ physics lineup stage */}
            <section class="ps-scene" ref={scene}>
              <div class="ps-stage" ref={stage}>
                <div class="ps-stage__head">
                  <span>01 — The lineup</span>
                  <span>Scroll to drop them in · throw to shake the pile</span>
                </div>

                <div class="ps-stage__title" aria-hidden="true">
                  LINEUP 2026
                </div>

                <ul class="ps-arena" ref={arena}>
                  {LINEUP.map((act) => (
                    <li
                      key={act.name}
                      class={
                        act.headline ? 'ps-pill ps-pill--headline' : 'ps-pill'
                      }
                      data-live="false"
                    >
                      {act.name}
                      {act.headline && <small>Headline</small>}
                    </li>
                  ))}
                </ul>

                <div class="ps-readout">
                  <span>
                    On stage <b data-ps="live">0 / 16</b>
                  </span>
                  <span>
                    Scroll velocity <b data-ps="vel">+0.0</b>
                  </span>
                  <span>
                    Effective gravity <b data-ps="g">1.00 g</b>
                  </span>
                  <span>Matter.js — 16 rigid bodies</span>
                </div>
              </div>
            </section>

            {/* ---------------------------------------------- schedule */}
            <section class="ps-section">
              <div class="ps-label" data-ps-reveal>
                02 — Schedule
              </div>
              <div class="ps-days">
                {DAYS.map((d) => (
                  <div class="ps-day" key={d.day} data-ps-reveal>
                    <h3>{d.day}</h3>
                    <div class="ps-day__date">{d.date}</div>
                    <ul>
                      {d.acts.map(([time, act]) => (
                        <li key={act}>
                          <span>{act}</span>
                          <time>{time}</time>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* ----------------------------------------------- tickets */}
            <section class="ps-section">
              <div class="ps-label" data-ps-reveal>
                03 — Tickets
              </div>
              <div class="ps-tiers">
                {TIERS.map((t) => (
                  <div
                    class={t.best ? 'ps-tier ps-tier--best' : 'ps-tier'}
                    key={t.name}
                    data-ps-reveal
                  >
                    <div class="ps-tier__name">{t.name}</div>
                    <div class="ps-tier__price">{t.price}</div>
                    <p>{t.note}</p>
                    <button type="button" class="ps-tier__cta">
                      Choose {t.name}
                    </button>
                  </div>
                ))}
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
  title: 'Pulse Festival — 12–14 June 2026',
  meta: [
    {
      name: 'description',
      content:
        'Case study: a festival lineup simulated as rigid bodies, where scroll velocity becomes the impulse. Matter.js and Motion One on a from-scratch virtual scroll engine.',
    },
  ],
  links: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',
    },
  ],
};
