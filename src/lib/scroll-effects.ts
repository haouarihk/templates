/**
 * Effects that sit on top of a scroll position. Deliberately engine-agnostic:
 * each takes a plain number, so the same helpers work with the custom
 * VirtualScroll engine, with Lenis, or with `window.scrollY`.
 */

export const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Remap a value from one range to another, clamped to the output range. */
export const mapRange = (
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
) => {
  if (inMax - inMin === 0) return outMin;
  const t = clamp((v - inMin) / (inMax - inMin), 0, 1);
  return outMin + t * (outMax - outMin);
};

/** Smoothstep, for easing a 0..1 progress without a library. */
export const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

// ---------------------------------------------------------------- parallax

interface ParallaxItem {
  el: HTMLElement;
  speed: number;
  /** Document-space offset of the element's top, transform excluded. */
  offset: number;
  height: number;
}

/**
 * Drives every `[data-speed]` element inside `root`. Speed is a multiplier on
 * the element's distance from the viewport centre: positive lags behind the
 * scroll, negative runs ahead of it.
 */
export class Parallax {
  private items: ParallaxItem[] = [];

  constructor(
    private root: ParentNode = document,
    private selector = '[data-speed]',
  ) {
    this.refresh(0);
  }

  /** Re-measure. `current` is the engine's scroll position at measure time. */
  refresh(current: number) {
    const nodes = Array.from(
      this.root.querySelectorAll<HTMLElement>(this.selector),
    );
    this.items = nodes.map((el) => {
      // Clear our own transform first, otherwise we'd measure our own output.
      const prev = el.style.transform;
      el.style.transform = '';
      const rect = el.getBoundingClientRect();
      el.style.transform = prev;
      return {
        el,
        speed: parseFloat(el.dataset.speed || '0'),
        offset: rect.top + current,
        height: rect.height,
      };
    });
  }

  update(current: number, viewport: number) {
    for (const item of this.items) {
      const centre = item.offset + item.height / 2 - current;
      const fromCentre = centre - viewport / 2;
      const y = -fromCentre * item.speed;
      item.el.style.transform = `translate3d(0,${y.toFixed(2)}px,0)`;
    }
  }

  destroy() {
    for (const item of this.items) item.el.style.transform = '';
    this.items = [];
  }
}

// ------------------------------------------------------------------ reveal

/**
 * Adds `.is-in` to `[data-reveal]` elements as they enter the viewport.
 * IntersectionObserver reports correctly through a transformed ancestor, so
 * this works unchanged under a virtual scroll wrapper.
 *
 * `data-reveal-once` (default true) unobserves after the first entry.
 */
export function createReveal(
  root: ParentNode = document,
  options: { threshold?: number; rootMargin?: string } = {},
) {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));

  // Stagger children by index so CSS can read `--i`.
  for (const group of Array.from(
    root.querySelectorAll<HTMLElement>('[data-reveal-group]'),
  )) {
    Array.from(group.children).forEach((child, i) =>
      (child as HTMLElement).style.setProperty('--i', String(i)),
    );
  }

  if (typeof IntersectionObserver === 'undefined') {
    els.forEach((el) => el.classList.add('is-in'));
    return { destroy() {} };
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          el.classList.add('is-in');
          if (el.dataset.revealOnce !== 'false') io.unobserve(el);
        } else if (el.dataset.revealOnce === 'false') {
          el.classList.remove('is-in');
        }
      }
    },
    {
      threshold: options.threshold ?? 0.15,
      rootMargin: options.rootMargin ?? '0px 0px -10% 0px',
    },
  );

  els.forEach((el) => io.observe(el));
  return { destroy: () => io.disconnect() };
}

// -------------------------------------------------------------- split text

export type SplitMode = 'chars' | 'words' | 'lines';

/**
 * Wraps an element's text so each unit can be animated independently. Each unit
 * is a masked outer span with a transformable inner span, and carries `--i` for
 * stagger. Returns the unit elements.
 *
 * `lines` measures real rendered line boxes by splitting to words first and
 * grouping on `offsetTop`, so it survives whatever the text wraps to.
 */
export function splitText(el: HTMLElement, mode: SplitMode = 'words') {
  const source = el.dataset.splitSource ?? el.textContent ?? '';
  el.dataset.splitSource = source; // idempotent across resizes
  el.textContent = '';

  const makeUnit = (text: string, cls: string) => {
    const outer = document.createElement('span');
    outer.className = `split__unit split__${cls}`;
    const inner = document.createElement('span');
    inner.className = 'split__inner';
    inner.textContent = text;
    outer.appendChild(inner);
    return outer;
  };

  if (mode === 'chars') {
    const units: HTMLElement[] = [];
    Array.from(source).forEach((ch, i) => {
      if (ch === ' ') {
        el.appendChild(document.createTextNode(' '));
        return;
      }
      const unit = makeUnit(ch, 'char');
      unit.style.setProperty('--i', String(i));
      el.appendChild(unit);
      units.push(unit);
    });
    return units;
  }

  const words = source.split(/(\s+)/).filter((w) => w.length > 0);
  const wordEls: HTMLElement[] = [];
  words.forEach((w) => {
    if (/^\s+$/.test(w)) {
      el.appendChild(document.createTextNode(' '));
      return;
    }
    const unit = makeUnit(w, 'word');
    el.appendChild(unit);
    wordEls.push(unit);
  });

  if (mode === 'words') {
    wordEls.forEach((u, i) => u.style.setProperty('--i', String(i)));
    return wordEls;
  }

  // lines: group the word spans by their rendered top offset.
  const rows = new Map<number, HTMLElement[]>();
  wordEls.forEach((w) => {
    const top = Math.round(w.offsetTop);
    const bucket = rows.get(top);
    if (bucket) bucket.push(w);
    else rows.set(top, [w]);
  });

  el.textContent = '';
  const lineEls: HTMLElement[] = [];
  Array.from(rows.values()).forEach((wordsInLine, i) => {
    const line = document.createElement('span');
    line.className = 'split__unit split__line';
    line.style.setProperty('--i', String(i));
    const inner = document.createElement('span');
    inner.className = 'split__inner';
    inner.textContent = wordsInLine
      .map((w) => w.textContent ?? '')
      .join(' ');
    line.appendChild(inner);
    el.appendChild(line);
    lineEls.push(line);
  });
  return lineEls;
}
