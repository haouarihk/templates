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
import { createReveal } from '../../lib/scroll-effects';
import { LOOKS, paintLook, type Look } from './looks';
import { LOOK_FRAGMENT, LOOK_VERTEX } from './shaders';

const STUDY = bySlug('flux')!;

const MATERIALS = [
  ['01', 'Boiled wool', 'Woven in Biella, fulled twice', '720 gsm'],
  ['02', 'Sandwashed silk', 'Mulberry filament, 19 momme', '88 gsm'],
  ['03', 'Dry cotton twill', 'Organic, undyed warp', '340 gsm'],
  ['04', 'Vegetable-tanned calf', 'Tuscan pits, 40 days', '1.4 mm'],
  ['05', 'Silk organza', 'Degummed, single-ply', '32 gsm'],
];

export default component$(() => {
  useStyles$(frameStyles);
  useStyles$(styles);

  const root = useSignal<HTMLDivElement>();
  const wrapper = useSignal<HTMLDivElement>();
  const content = useSignal<HTMLDivElement>();
  const glHost = useSignal<HTMLDivElement>();

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    async ({ cleanup }) => {
      const el = {
        root: root.value,
        wrapper: wrapper.value,
        content: content.value,
        glHost: glHost.value,
      };
      if (!el.root || !el.wrapper || !el.content || !el.glHost) return;

      const lookById = new Map<string, Look>(LOOKS.map((l) => [l.id, l]));
      const slotEls = Array.from(
        el.content.querySelectorAll<HTMLElement>('[data-gl]'),
      );

      /**
       * When we cannot (or should not) run the GL layer, the looks still have
       * to appear. Painting each one straight into its placeholder gives the
       * same page without the engine.
       */
      const paintIntoDom = () => {
        for (const node of slotEls) {
          const look = lookById.get(node.dataset.gl!);
          if (!look || node.querySelector('canvas')) continue;
          const c = paintLook(look, 720, 960);
          c.setAttribute('aria-hidden', 'true');
          node.appendChild(c);
        }
      };

      // Build the engine first even under reduced motion: it owns the
      // decision, and its disabled path is what hands scrolling back to the
      // browser. Returning before this point would leave the fixed wrapper in
      // place with nothing able to scroll it.
      const engine = new VirtualScroll({
        wrapper: el.wrapper,
        content: el.content,
        ease: 0.095,
      });
      cleanup(() => engine.destroy());

      const reveal = createReveal(el.content);
      cleanup(() => reveal.destroy());

      if (engine.isDisabled) {
        el.root.dataset.native = 'true';
        paintIntoDom();
        return;
      }

      const THREE = await import('three');

      // --- renderer ---------------------------------------------------------
      const canvas = document.createElement('canvas');
      el.glHost.appendChild(canvas);

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: false,
          powerPreference: 'high-performance',
        });
      } catch {
        // No WebGL (blocked, software-blacklisted, out of contexts).
        el.root.dataset.native = 'true';
        paintIntoDom();
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      cleanup(() => {
        renderer.dispose();
        canvas.remove();
      });

      // Pixel-unit camera: at this distance one world unit is one CSS pixel,
      // which lets the planes be positioned directly from DOM rects.
      const PERSPECTIVE = 1200;
      const camera = new THREE.PerspectiveCamera(50, 1, 10, 5000);
      camera.position.z = PERSPECTIVE;
      const scene = new THREE.Scene();

      const geometry = new THREE.PlaneGeometry(1, 1, 40, 30);
      cleanup(() => geometry.dispose());

      interface Slot {
        el: HTMLElement;
        mesh: import('three').Mesh;
        uniforms: Record<string, { value: unknown }>;
        top: number;
        left: number;
        w: number;
        h: number;
      }

      const slots: Slot[] = [];
      for (const node of slotEls) {
        const look = lookById.get(node.dataset.gl!);
        if (!look) continue;

        const source = paintLook(look);
        const texture = new THREE.CanvasTexture(source);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;

        const uniforms = {
          uTexture: { value: texture },
          uVelocity: { value: 0 },
          uOpacity: { value: 1 },
          uSize: { value: new THREE.Vector2(1, 1) },
          uPlaneAspect: { value: 1 },
          uTexAspect: { value: source.width / source.height },
        };

        const material = new THREE.ShaderMaterial({
          vertexShader: LOOK_VERTEX,
          fragmentShader: LOOK_FRAGMENT,
          uniforms,
          transparent: true,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false; // we cull against the DOM rect ourselves
        scene.add(mesh);
        slots.push({ el: node, mesh, uniforms, top: 0, left: 0, w: 0, h: 0 });

        cleanup(() => {
          material.dispose();
          texture.dispose();
        });
      }

      // --- measurement ------------------------------------------------------
      let vw = 0;
      let vh = 0;

      const measure = () => {
        vw = window.innerWidth;
        vh = window.innerHeight;

        renderer.setSize(vw, vh, false);
        camera.fov = 2 * Math.atan(vh / 2 / PERSPECTIVE) * (180 / Math.PI);
        camera.aspect = vw / vh;
        camera.updateProjectionMatrix();

        const contentTop = el.content!.getBoundingClientRect().top;
        for (const s of slots) {
          const r = s.el.getBoundingClientRect();
          // Document-space, so the per-frame update is pure arithmetic.
          s.top = r.top - contentTop;
          s.left = r.left;
          s.w = r.width;
          s.h = r.height;
          s.mesh.scale.set(s.w, s.h, 1);
          (s.uniforms.uSize.value as import('three').Vector2).set(s.w, s.h);
          s.uniforms.uPlaneAspect.value = s.w / Math.max(s.h, 1);
        }
      };

      const outVel = document.querySelector<HTMLElement>('[data-fx="vel"]');
      const outDrawn = document.querySelector<HTMLElement>('[data-fx="drawn"]');
      let textTick = 0;

      const draw = (scroll: number, velocity: number) => {
        // A hard flick can spike velocity past anything that still looks
        // designed, so the shader sees a bounded version of it.
        const v = Math.max(-70, Math.min(70, velocity));
        let drawn = 0;
        for (const s of slots) {
          const top = s.top - scroll;
          const visible = top < vh + 240 && top + s.h > -240;
          s.mesh.visible = visible;
          if (!visible) continue;
          drawn++;
          s.mesh.position.x = s.left + s.w / 2 - vw / 2;
          s.mesh.position.y = -(top + s.h / 2 - vh / 2);
          s.uniforms.uVelocity.value = v;
        }
        renderer.render(scene, camera);

        // Throttle the text so it doesn't cost a layout every frame.
        if (++textTick % 6 === 0) {
          if (outVel) {
            outVel.textContent = `${velocity >= 0 ? '+' : ''}${velocity.toFixed(1)}`;
          }
          if (outDrawn) outDrawn.textContent = `${drawn} / ${slots.length}`;
        }
      };

      measure();
      draw(engine.state.current, 0);

      const off = engine.on((state) => draw(state.current, state.velocity));
      cleanup(off);

      const relayout = () => {
        measure();
        draw(engine.state.current, engine.state.velocity);
      };
      window.addEventListener('resize', relayout);
      cleanup(() => window.removeEventListener('resize', relayout));
      document.fonts?.ready.then(() => {
        engine.measure();
        relayout();
      });

      const ro = new ResizeObserver(() => relayout());
      ro.observe(el.content);
      cleanup(() => ro.disconnect());

      // Losing the GL context mid-session should degrade, not go blank.
      const onLost = (e: Event) => {
        e.preventDefault();
        el.root!.dataset.native = 'true';
        paintIntoDom();
      };
      canvas.addEventListener('webglcontextlost', onLost);
      cleanup(() => canvas.removeEventListener('webglcontextlost', onLost));
    },
    { strategy: 'document-ready' },
  );

  return (
    <div class="fx" ref={root}>
      <a class="skip-link" href="#fx-main">
        Skip to content
      </a>
      <CaseBar study={STUDY} />

      <div class="fx-gl" ref={glHost} aria-hidden="true" />

      <div class="fx-readout" aria-hidden="true">
        <div>
          <b>Velocity</b>
          <span data-fx="vel">+0.0</span>
        </div>
        <div>
          <b>Planes drawn</b>
          <span data-fx="drawn">0 / 6</span>
        </div>
        <div>
          <b>Layer</b>
          <span>WebGL</span>
        </div>
      </div>

      <div data-vs-wrapper ref={wrapper}>
        <div ref={content}>
          <main id="fx-main">
            {/* -------------------------------------------------- hero */}
            <section class="fx-hero">
              <div class="fx-hero__plate" data-gl="look-02" />
              <h1 class="fx-hero__mark">FLUX</h1>
              <div class="fx-hero__sub">
                <span>
                  <b>SS26</b> — Interval
                </span>
                <span>Lisbon · Paris</span>
                <span>18 looks</span>
                <span>Throw the page ↓</span>
              </div>
            </section>

            {/* --------------------------------------------- statement */}
            <section class="fx-section fx-statement">
              <div class="fx-label">01 — Interval</div>
              <p data-reveal="fade">
                A collection about the moment between two states — the pause
                where fabric has stopped moving but has not yet <em>settled</em>.
              </p>
              <p data-reveal="fade">
                So the lookbook does the same. Nothing here is a still image;
                every frame reacts to how hard you move it.
              </p>
            </section>

            {/* ---------------------------------------------- lookbook */}
            <section class="fx-section">
              <div class="fx-label">02 — Lookbook</div>
              <div>
                {LOOKS.map((look) => (
                  <article class="fx-look" key={look.id}>
                    <div class="fx-look__frame">
                      <div
                        class="fx-media"
                        data-gl={look.id}
                        role="img"
                        aria-label={`Look ${look.no}: ${look.name} in ${look.colourway}.`}
                      />
                    </div>
                    <div class="fx-look__meta">
                      <div class="fx-look__no">Look {look.no}</div>
                      <h3>{look.name}</h3>
                      <dl>
                        <dt>Fabric</dt>
                        <dd>{look.fabric}</dd>
                        <dt>Colourway</dt>
                        <dd>{look.colourway}</dd>
                      </dl>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* --------------------------------------------- materials */}
            <section class="fx-section">
              <div class="fx-label">03 — Materials</div>
              <ul class="fx-materials">
                {MATERIALS.map(([no, name, note, spec]) => (
                  <li key={no}>
                    <span>{no}</span>
                    <b>{name}</b>
                    <span class="fx-note">{note}</span>
                    <span>{spec}</span>
                  </li>
                ))}
              </ul>
            </section>

            <CaseFooter study={STUDY} />
          </main>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'FLUX — SS26 Interval',
  meta: [
    {
      name: 'description',
      content:
        'Case study: a WebGL lookbook whose planes are pinned to DOM layout and displaced by scroll velocity, on a from-scratch virtual scroll engine.',
    },
  ],
  links: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap',
    },
  ],
};
