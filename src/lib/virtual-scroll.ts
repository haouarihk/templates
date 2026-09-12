/**
 * VirtualScroll
 * =============
 * A scroll engine written from scratch. Native scrolling is fully suppressed on
 * the document; wheel / touch / keyboard input is captured, integrated into a
 * `target` position, and a separate `current` position chases it every frame.
 * Content is painted with `translate3d`, so the one-frame gap between `target`
 * and `current` becomes the smooth-scroll feel, and the gap's magnitude becomes
 * `velocity` — the signal every downstream effect (skew, shader displacement,
 * physics impulse) is driven by.
 *
 * Design notes that matter:
 *
 * - Damping is frame-rate independent. A naive `current += (target-current)*0.1`
 *   moves twice as fast on a 120Hz display as on 60Hz. We use exponential decay
 *   against real elapsed time instead, so the feel is identical everywhere.
 * - The rAF loop parks itself when the scroll has settled and no momentum is
 *   left, so an idle page costs nothing.
 * - Native scroll is off, which means the native scrollbar is gone and focus no
 *   longer scrolls things into view. Both are re-implemented rather than
 *   abandoned: a synthetic scrollbar you can drag, and a `focusin` handler that
 *   brings keyboard-focused elements into frame.
 * - `prefers-reduced-motion` disables the whole engine and restores plain native
 *   scrolling. Hijacked scroll is a genuine vestibular trigger; this is not
 *   optional.
 */

export type ScrollAxis = 'vertical' | 'horizontal';

export interface VirtualScrollState {
  /** Eased position in px. This is what you render with. */
  current: number;
  /** Raw input position in px. Where the user actually "is". */
  target: number;
  /** Signed px/frame gap between target and current. The effects signal. */
  velocity: number;
  /** Normalised velocity, roughly -1..1, clamped. Safer for shader uniforms. */
  velocityNorm: number;
  /** 0..1 through the scrollable range. */
  progress: number;
  /** Total scrollable distance in px. */
  limit: number;
  /** Viewport size along the scroll axis. */
  viewport: number;
  /** Full content size along the scroll axis. */
  contentSize: number;
  /** 1 while moving forward, -1 backward, 0 at rest. */
  direction: number;
}

export interface VirtualScrollOptions {
  /** Fixed-position element that clips the content. Defaults to a generated one. */
  wrapper: HTMLElement;
  /** The element that actually gets transformed. */
  content: HTMLElement;
  /**
   * Easing strength expressed as "fraction closed per frame at 60fps", 0..1.
   * 0.1 is loose and floaty, 0.25 is tight, 1 disables easing entirely.
   */
  ease?: number;
  axis?: ScrollAxis;
  wheelMultiplier?: number;
  touchMultiplier?: number;
  keyStep?: number;
  /** Render a draggable synthetic scrollbar. */
  scrollbar?: boolean;
  /** Honour prefers-reduced-motion by falling back to native scroll. */
  respectReducedMotion?: boolean;
  /** Clamp for `velocityNorm`. Velocity above this reads as full-scale. */
  velocityScale?: number;
  onUpdate?: (state: VirtualScrollState) => void;
}

type Subscriber = (state: VirtualScrollState) => void;

const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

/**
 * Exponential damping. `lambda` is the decay rate per second, `dt` real seconds.
 * Equivalent to a lerp but invariant to frame rate.
 */
const damp = (from: number, to: number, lambda: number, dt: number) =>
  to + (from - to) * Math.exp(-lambda * dt);

/** Convert a designer-friendly "ease per frame at 60fps" into a decay rate. */
const easeToLambda = (ease: number) =>
  ease >= 1 ? Infinity : -Math.log(1 - clamp(ease, 0.001, 0.999)) * 60;

const SCROLLBAR_CSS = `
.vs-scrollbar{position:fixed;top:0;right:0;width:10px;height:100%;z-index:9999;
  opacity:0;transition:opacity .3s ease;pointer-events:auto;touch-action:none}
.vs-scrollbar:hover,.vs-scrollbar[data-active="true"],
.vs-scrollbar[data-visible="true"]{opacity:1}
.vs-scrollbar__thumb{position:absolute;top:0;right:2px;width:6px;border-radius:6px;
  background:currentColor;opacity:.35;transition:opacity .2s ease,width .2s ease}
.vs-scrollbar:hover .vs-scrollbar__thumb,
.vs-scrollbar[data-active="true"] .vs-scrollbar__thumb{opacity:.75;width:8px}
`;

let styleInjected = false;
function injectScrollbarStyles() {
  if (styleInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.setAttribute('data-virtual-scroll', '');
  el.textContent = SCROLLBAR_CSS;
  document.head.appendChild(el);
  styleInjected = true;
}

export class VirtualScroll {
  readonly state: VirtualScrollState = {
    current: 0,
    target: 0,
    velocity: 0,
    velocityNorm: 0,
    progress: 0,
    limit: 0,
    viewport: 0,
    contentSize: 0,
    direction: 0,
  };

  private opts: Required<Omit<VirtualScrollOptions, 'onUpdate'>> & {
    onUpdate?: (s: VirtualScrollState) => void;
  };
  private lambda: number;
  private subscribers = new Set<Subscriber>();
  private raf = 0;
  private lastTime = 0;
  private running = false;
  private stopped = false;
  private destroyed = false;
  private disabled = false;

  /** Residual touch-flick velocity, decays to zero. */
  private momentum = 0;
  private pointerActive = false;
  private pointerLast = 0;
  private pointerSamples: { pos: number; t: number }[] = [];

  private bar?: HTMLElement;
  private thumb?: HTMLElement;
  private barDragging = false;
  private barGrabOffset = 0;
  private barHideTimer = 0;

  private resizeObserver?: ResizeObserver;
  private motionQuery?: MediaQueryList;

  constructor(options: VirtualScrollOptions) {
    this.opts = {
      ease: 0.1,
      axis: 'vertical',
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
      keyStep: 120,
      scrollbar: true,
      respectReducedMotion: true,
      velocityScale: 60,
      ...options,
    };
    this.lambda = easeToLambda(this.opts.ease);

    this.motionQuery =
      typeof matchMedia === 'function'
        ? matchMedia('(prefers-reduced-motion: reduce)')
        : undefined;

    if (this.opts.respectReducedMotion && this.motionQuery?.matches) {
      this.enterNativeFallback();
      return;
    }

    this.setup();
  }

  // ---------------------------------------------------------------- lifecycle

  private setup() {
    const { wrapper, content } = this.opts;

    // Take the document out of the scrolling business entirely.
    document.documentElement.classList.add('vs-active');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    Object.assign(wrapper.style, {
      position: 'fixed',
      inset: '0',
      overflow: 'hidden',
      willChange: 'transform',
    } as Partial<CSSStyleDeclaration>);

    Object.assign(content.style, {
      willChange: 'transform',
      // The transform creates a containing block; make sure the content can
      // still size itself naturally along the scroll axis.
      ...(this.opts.axis === 'vertical'
        ? { width: '100%' }
        : { display: 'flex', height: '100%' }),
    } as Partial<CSSStyleDeclaration>);

    this.measure();

    // --- input -------------------------------------------------------------
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('focusin', this.onFocusIn);
    wrapper.addEventListener('pointerdown', this.onPointerDown);
    wrapper.addEventListener('pointermove', this.onPointerMove, {
      passive: false,
    });
    wrapper.addEventListener('pointerup', this.onPointerUp);
    wrapper.addEventListener('pointercancel', this.onPointerUp);
    // Safari/iOS still fires touchmove for rubber-banding; suppress it.
    wrapper.addEventListener('touchmove', this.preventDefault, {
      passive: false,
    });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.measure());
      this.resizeObserver.observe(content);
    }

    this.motionQuery?.addEventListener?.('change', this.onMotionPrefChange);

    if (this.opts.scrollbar) this.buildScrollbar();

    this.render(0);
    this.wake();
  }

  /**
   * Reduced-motion path: no engine at all, just restore the browser's own
   * scrolling. The wrapper/content lose their fixed positioning so the page
   * behaves like an ordinary document.
   */
  private enterNativeFallback() {
    this.disabled = true;
    const { wrapper, content } = this.opts;
    document.documentElement.classList.add('vs-native');
    wrapper.style.position = 'static';
    wrapper.style.overflow = 'visible';
    content.style.transform = 'none';
    content.style.willChange = 'auto';

    const sync = () => {
      this.state.current = this.state.target = window.scrollY;
      this.state.velocity = 0;
      this.state.velocityNorm = 0;
      this.state.viewport = window.innerHeight;
      this.state.contentSize = document.documentElement.scrollHeight;
      this.state.limit = Math.max(
        0,
        this.state.contentSize - this.state.viewport,
      );
      this.state.progress =
        this.state.limit > 0 ? this.state.current / this.state.limit : 0;
      this.emit();
    };
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.running = false;

    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('focusin', this.onFocusIn);

    const { wrapper } = this.opts;
    wrapper.removeEventListener('pointerdown', this.onPointerDown);
    wrapper.removeEventListener('pointermove', this.onPointerMove);
    wrapper.removeEventListener('pointerup', this.onPointerUp);
    wrapper.removeEventListener('pointercancel', this.onPointerUp);
    wrapper.removeEventListener('touchmove', this.preventDefault);

    this.resizeObserver?.disconnect();
    this.motionQuery?.removeEventListener?.('change', this.onMotionPrefChange);

    this.bar?.remove();
    window.removeEventListener('pointermove', this.onBarMove);
    window.removeEventListener('pointerup', this.onBarUp);

    document.documentElement.classList.remove('vs-active', 'vs-native');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    this.subscribers.clear();
  }

  // ------------------------------------------------------------ measurement

  measure = () => {
    if (this.disabled) return;
    const vertical = this.opts.axis === 'vertical';
    const rect = this.opts.content.getBoundingClientRect();

    this.state.viewport = vertical ? window.innerHeight : window.innerWidth;
    this.state.contentSize = vertical
      ? this.opts.content.scrollHeight || rect.height
      : this.opts.content.scrollWidth || rect.width;
    this.state.limit = Math.max(0, this.state.contentSize - this.state.viewport);

    this.state.target = clamp(this.state.target, 0, this.state.limit);
    this.state.current = clamp(this.state.current, 0, this.state.limit);

    this.updateThumb();
    this.wake();
  };

  // ------------------------------------------------------------------- loop

  private wake() {
    if (this.running || this.destroyed || this.disabled || this.stopped) return;
    this.running = true;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    // Cap dt so a backgrounded tab doesn't teleport the page on return.
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    // Touch flick residue feeds the target, then decays.
    if (Math.abs(this.momentum) > 0.05) {
      this.state.target = clamp(
        this.state.target + this.momentum * dt * 60,
        0,
        this.state.limit,
      );
      this.momentum *= Math.exp(-4 * dt);
    } else {
      this.momentum = 0;
    }

    const prev = this.state.current;
    this.state.current =
      this.lambda === Infinity
        ? this.state.target
        : damp(this.state.current, this.state.target, this.lambda, dt);

    const delta = this.state.current - prev;
    this.state.velocity = delta;
    this.state.velocityNorm = clamp(delta / this.opts.velocityScale, -1, 1);
    this.state.direction = delta > 0.01 ? 1 : delta < -0.01 ? -1 : 0;

    this.render(this.state.current);

    // Park the loop once everything has settled.
    const settled =
      Math.abs(this.state.target - this.state.current) < 0.05 &&
      this.momentum === 0;
    if (settled && !this.pointerActive && !this.barDragging) {
      this.state.current = this.state.target;
      this.state.velocity = 0;
      this.state.velocityNorm = 0;
      this.state.direction = 0;
      this.render(this.state.current);
      this.running = false;
      return;
    }

    this.raf = requestAnimationFrame(this.tick);
  };

  private render(pos: number) {
    this.state.progress =
      this.state.limit > 0 ? clamp(pos / this.state.limit, 0, 1) : 0;

    const t =
      this.opts.axis === 'vertical'
        ? `translate3d(0,${-pos}px,0)`
        : `translate3d(${-pos}px,0,0)`;
    this.opts.content.style.transform = t;

    this.updateThumb();
    this.emit();
  }

  private emit() {
    this.opts.onUpdate?.(this.state);
    for (const fn of this.subscribers) fn(this.state);
  }

  // ------------------------------------------------------------------ input

  private preventDefault = (e: Event) => e.preventDefault();

  /** Elements inside `[data-vs-ignore]` keep their own native scrolling. */
  private isIgnored(target: EventTarget | null) {
    return (
      target instanceof Element && target.closest('[data-vs-ignore]') !== null
    );
  }

  private onWheel = (e: WheelEvent) => {
    if (this.stopped || this.isIgnored(e.target)) return;
    e.preventDefault();

    // Normalise across the three deltaMode units browsers report in.
    let delta = this.opts.axis === 'vertical' ? e.deltaY : e.deltaX || e.deltaY;
    if (e.deltaMode === 1) delta *= 16; // lines
    else if (e.deltaMode === 2) delta *= this.state.viewport; // pages

    this.momentum = 0;
    this.state.target = clamp(
      this.state.target + delta * this.opts.wheelMultiplier,
      0,
      this.state.limit,
    );
    this.flashScrollbar();
    this.wake();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || this.stopped || this.isIgnored(e.target))
      return;
    this.pointerActive = true;
    this.momentum = 0;
    this.pointerLast =
      this.opts.axis === 'vertical' ? e.clientY : e.clientX;
    this.pointerSamples = [{ pos: this.pointerLast, t: performance.now() }];
    this.wake();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointerActive) return;
    e.preventDefault();
    const pos = this.opts.axis === 'vertical' ? e.clientY : e.clientX;
    const delta = (this.pointerLast - pos) * this.opts.touchMultiplier;
    this.pointerLast = pos;

    this.state.target = clamp(
      this.state.target + delta,
      0,
      this.state.limit,
    );

    // Keep a short window of samples so the release velocity reflects the
    // last flick rather than the whole drag.
    const now = performance.now();
    this.pointerSamples.push({ pos, t: now });
    while (
      this.pointerSamples.length > 2 &&
      now - this.pointerSamples[0].t > 100
    ) {
      this.pointerSamples.shift();
    }
    this.flashScrollbar();
    this.wake();
  };

  private onPointerUp = () => {
    if (!this.pointerActive) return;
    this.pointerActive = false;

    const first = this.pointerSamples[0];
    const last = this.pointerSamples[this.pointerSamples.length - 1];
    if (first && last && last.t > first.t) {
      const vPerMs = (first.pos - last.pos) / (last.t - first.t);
      // px/ms -> px/frame, then a little extra throw.
      this.momentum = clamp(vPerMs * 16 * this.opts.touchMultiplier, -80, 80);
    }
    this.pointerSamples = [];
    this.wake();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.stopped || this.isIgnored(e.target)) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((e.target as HTMLElement)?.isContentEditable) return;

    const page = this.state.viewport * 0.9;
    let delta: number | null = null;
    switch (e.key) {
      case 'ArrowDown':
        delta = this.opts.keyStep;
        break;
      case 'ArrowUp':
        delta = -this.opts.keyStep;
        break;
      case 'PageDown':
        delta = page;
        break;
      case 'PageUp':
        delta = -page;
        break;
      case ' ':
        delta = e.shiftKey ? -page : page;
        break;
      case 'Home':
        this.scrollTo(0);
        e.preventDefault();
        return;
      case 'End':
        this.scrollTo(this.state.limit);
        e.preventDefault();
        return;
    }
    if (delta === null) return;
    e.preventDefault();
    this.momentum = 0;
    this.state.target = clamp(this.state.target + delta, 0, this.state.limit);
    this.flashScrollbar();
    this.wake();
  };

  /**
   * With native scroll off, tabbing to an offscreen element would leave it
   * offscreen. Bring it into view manually.
   */
  private onFocusIn = (e: FocusEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el || this.disabled || !this.opts.content.contains(el)) return;
    const rect = el.getBoundingClientRect();
    const vertical = this.opts.axis === 'vertical';
    const start = vertical ? rect.top : rect.left;
    const end = vertical ? rect.bottom : rect.right;
    const size = this.state.viewport;
    const margin = 80;
    if (start < margin) {
      this.scrollTo(this.state.target + start - margin);
    } else if (end > size - margin) {
      this.scrollTo(this.state.target + end - size + margin);
    }
  };

  private onResize = () => this.measure();

  private onMotionPrefChange = (e: MediaQueryListEvent) => {
    // Switching preference mid-session is rare; a reload is the honest fix.
    if (e.matches && !this.disabled) {
      this.destroy();
      location.reload();
    }
  };

  // -------------------------------------------------------------- scrollbar

  private buildScrollbar() {
    injectScrollbarStyles();
    const bar = document.createElement('div');
    bar.className = 'vs-scrollbar';
    bar.setAttribute('aria-hidden', 'true');
    const thumb = document.createElement('div');
    thumb.className = 'vs-scrollbar__thumb';
    bar.appendChild(thumb);
    document.body.appendChild(bar);
    this.bar = bar;
    this.thumb = thumb;

    thumb.addEventListener('pointerdown', this.onBarDown);
    bar.addEventListener('pointerdown', (e) => {
      if (e.target === thumb) return;
      // Click the track to jump.
      const ratio = e.clientY / window.innerHeight;
      this.scrollTo(ratio * this.state.limit);
    });
    this.updateThumb();
  }

  private onBarDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.barDragging = true;
    this.bar?.setAttribute('data-active', 'true');
    const thumbRect = this.thumb!.getBoundingClientRect();
    this.barGrabOffset = e.clientY - thumbRect.top;
    window.addEventListener('pointermove', this.onBarMove);
    window.addEventListener('pointerup', this.onBarUp);
  };

  private onBarMove = (e: PointerEvent) => {
    if (!this.barDragging || !this.thumb) return;
    const trackH = window.innerHeight;
    const thumbH = this.thumb.offsetHeight;
    const y = clamp(e.clientY - this.barGrabOffset, 0, trackH - thumbH);
    const ratio = trackH - thumbH > 0 ? y / (trackH - thumbH) : 0;
    this.momentum = 0;
    this.state.target = ratio * this.state.limit;
    this.wake();
  };

  private onBarUp = () => {
    this.barDragging = false;
    this.bar?.removeAttribute('data-active');
    window.removeEventListener('pointermove', this.onBarMove);
    window.removeEventListener('pointerup', this.onBarUp);
  };

  private updateThumb() {
    if (!this.thumb) return;
    const trackH = window.innerHeight;
    const ratio =
      this.state.contentSize > 0
        ? this.state.viewport / this.state.contentSize
        : 1;
    const thumbH = clamp(ratio * trackH, 40, trackH);
    const y = (trackH - thumbH) * this.state.progress;
    this.thumb.style.height = `${thumbH}px`;
    this.thumb.style.transform = `translateY(${y}px)`;
    if (this.state.limit <= 0) this.bar?.style.setProperty('display', 'none');
    else this.bar?.style.removeProperty('display');
  }

  private flashScrollbar() {
    if (!this.bar) return;
    this.bar.setAttribute('data-visible', 'true');
    clearTimeout(this.barHideTimer);
    this.barHideTimer = window.setTimeout(
      () => this.bar?.removeAttribute('data-visible'),
      900,
    );
  }

  // ----------------------------------------------------------------- public

  /** Jump or glide to an absolute px offset, or to an element. */
  scrollTo(
    to: number | HTMLElement | string,
    opts: { immediate?: boolean; offset?: number } = {},
  ) {
    let value = 0;
    if (typeof to === 'number') {
      value = to;
    } else {
      const el =
        typeof to === 'string'
          ? (document.querySelector(to) as HTMLElement | null)
          : to;
      if (!el) return;
      if (this.disabled) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      const rect = el.getBoundingClientRect();
      value =
        this.state.current +
        (this.opts.axis === 'vertical' ? rect.top : rect.left);
    }
    value = clamp(value + (opts.offset ?? 0), 0, this.state.limit);
    this.momentum = 0;
    this.state.target = value;
    if (opts.immediate) {
      this.state.current = value;
      this.render(value);
    }
    this.wake();
  }

  /** Pause input handling — for modals, menus, intro sequences. */
  stop() {
    this.stopped = true;
    this.momentum = 0;
  }

  start() {
    this.stopped = false;
    this.wake();
  }

  /** Subscribe to per-frame state. Returns an unsubscribe function. */
  on(fn: Subscriber) {
    this.subscribers.add(fn);
    fn(this.state);
    return () => this.subscribers.delete(fn);
  }

  get isDisabled() {
    return this.disabled;
  }
}
