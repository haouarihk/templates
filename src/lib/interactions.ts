/**
 * Pointer-level polish: magnetic buttons and a custom cursor that reads the
 * element under it. Both no-op on coarse pointers, where they would only get
 * in the way.
 */

const finePointer = () =>
  typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

/**
 * Pulls an element toward the cursor while it hovers, then springs it back.
 * `strength` is the fraction of the cursor's offset the element travels.
 */
export function magnetic(
  el: HTMLElement,
  { strength = 0.35, radius = 1.4 } = {},
) {
  if (!finePointer()) return () => {};

  let raf = 0;
  let tx = 0;
  let ty = 0;
  let cx = 0;
  let cy = 0;
  let active = false;

  const loop = () => {
    cx += (tx - cx) * 0.15;
    cy += (ty - cy) * 0.15;
    el.style.transform = `translate3d(${cx.toFixed(2)}px,${cy.toFixed(2)}px,0)`;
    if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) {
      raf = requestAnimationFrame(loop);
    } else {
      raf = 0;
      if (!active) el.style.transform = '';
    }
  };
  const wake = () => {
    if (!raf) raf = requestAnimationFrame(loop);
  };

  const onMove = (e: PointerEvent) => {
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    const reach = (Math.max(rect.width, rect.height) / 2) * radius;
    if (dist > reach) {
      active = false;
      tx = ty = 0;
    } else {
      active = true;
      tx = dx * strength;
      ty = dy * strength;
    }
    wake();
  };
  const onLeave = () => {
    active = false;
    tx = ty = 0;
    wake();
  };

  window.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', onLeave);

  return () => {
    window.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerleave', onLeave);
    cancelAnimationFrame(raf);
    el.style.transform = '';
  };
}

export interface CursorHandle {
  destroy(): void;
}

/**
 * A trailing custom cursor. Elements can opt into states with
 * `data-cursor="view"` / `data-cursor-text="Open"`.
 */
export function createCursor(): CursorHandle {
  if (!finePointer()) return { destroy() {} };

  const root = document.createElement('div');
  root.className = 'cursor';
  root.setAttribute('aria-hidden', 'true');
  const dot = document.createElement('div');
  dot.className = 'cursor__dot';
  const ring = document.createElement('div');
  ring.className = 'cursor__ring';
  // Inner element exists so the press-state scale never composites with the
  // per-frame translate applied to `ring` — see the note in global.css.
  const ringIn = document.createElement('div');
  ringIn.className = 'cursor__ring-in';
  const label = document.createElement('span');
  label.className = 'cursor__label';
  ringIn.appendChild(label);
  ring.appendChild(ringIn);
  root.append(ring, dot);
  document.body.appendChild(root);

  let mx = innerWidth / 2;
  let my = innerHeight / 2;
  let rx = mx;
  let ry = my;
  let raf = 0;

  const loop = () => {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    dot.style.transform = `translate3d(${mx}px,${my}px,0) translate(-50%,-50%)`;
    ring.style.transform = `translate3d(${rx.toFixed(2)}px,${ry.toFixed(
      2,
    )}px,0) translate(-50%,-50%)`;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const onMove = (e: PointerEvent) => {
    mx = e.clientX;
    my = e.clientY;
    root.dataset.visible = 'true';

    const target = (e.target as Element | null)?.closest<HTMLElement>(
      '[data-cursor]',
    );
    if (target) {
      root.dataset.state = target.dataset.cursor || 'hover';
      label.textContent = target.dataset.cursorText || '';
    } else {
      root.dataset.state = '';
      label.textContent = '';
    }
  };
  const onLeave = () => (root.dataset.visible = 'false');
  const onDown = () => (root.dataset.down = 'true');
  const onUp = () => (root.dataset.down = 'false');

  window.addEventListener('pointermove', onMove);
  document.addEventListener('pointerleave', onLeave);
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      root.remove();
    },
  };
}
