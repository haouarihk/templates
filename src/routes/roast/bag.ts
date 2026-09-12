/**
 * A scroll-scrubbed product sequence, synthesised rather than downloaded.
 *
 * The familiar version of this effect (Apple's product pages) ships a few
 * hundred JPEGs and scrubs an <img> through them. That costs tens of megabytes
 * and is fixed at one resolution. Here the frame is *rendered* at scrub time:
 * the bag is a box, projected with a real perspective camera, and its wrap-
 * around label is texture-mapped onto the visible faces with perspective-
 * correct column slicing — the same trick software rasterisers used before GPUs.
 *
 * The result scrubs identically, renders at native device resolution, and adds
 * nothing to the network payload.
 */

// --- the parcel, in world units --------------------------------------------
const W = 300; // face width
const D = 122; // depth
const H = 430; // height
const CAM = 1500; // camera distance
const FOCAL = 1500;

const PERIMETER = 2 * (W + D);
/** Normalised texture boundaries: front, right, back, left. */
const FACE_U = [
  0,
  W / PERIMETER,
  (W + D) / PERIMETER,
  (2 * W + D) / PERIMETER,
  1,
];

/** Corner positions on the ground plane, walking around the box. */
const CORNERS: [number, number][] = [
  [-W / 2, -D / 2],
  [W / 2, -D / 2],
  [W / 2, D / 2],
  [-W / 2, D / 2],
];

/** Outward normals for the face that starts at each corner. */
const NORMALS: [number, number][] = [
  [0, -1], // front
  [1, 0], // right
  [0, 1], // back
  [-1, 0], // left
];

const BAG_BASE = '#2a1c14';
const BAG_INK = '#f0e6d8';
const BAG_ACCENT = '#c2622b';

/**
 * The label, drawn once into an offscreen canvas as one continuous wrap. Each
 * face samples its own horizontal slice, so artwork runs around the parcel the
 * way real packaging does.
 */
export function createLabelTexture(): HTMLCanvasElement {
  const K = 2;
  const tw = Math.round(PERIMETER * K);
  const th = Math.round(H * K);
  const c = document.createElement('canvas');
  c.width = tw;
  c.height = th;
  const g = c.getContext('2d')!;
  g.scale(K, K);

  const uw = PERIMETER; // in world units, post-scale
  const hh = H;

  g.fillStyle = BAG_BASE;
  g.fillRect(0, 0, uw, hh);

  // Very slight vertical sheen so the material doesn't read as flat paper.
  const sheen = g.createLinearGradient(0, 0, 0, hh);
  sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0.01)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, uw, hh);

  // ---- front face ---------------------------------------------------------
  const fx = 0;
  g.save();
  g.translate(fx, 0);

  g.fillStyle = BAG_INK;
  g.font = '600 15px "JetBrains Mono", monospace';
  g.letterSpacing = '3px';
  g.fillText('MERIDIAN', 26, 52);

  g.font = '400 12px "JetBrains Mono", monospace';
  g.letterSpacing = '2.5px';
  g.globalAlpha = 0.55;
  g.fillText('ROASTERS — LISBOA', 26, 74);
  g.globalAlpha = 1;

  g.letterSpacing = '0px';
  g.fillStyle = BAG_INK;
  g.font = '300 62px "Fraunces", Georgia, serif';
  g.fillText('Guji', 26, 196);
  g.fillText('Ethiopia', 26, 256);

  g.fillStyle = BAG_ACCENT;
  g.fillRect(26, 286, 116, 5);

  g.fillStyle = BAG_INK;
  g.font = '400 13px "JetBrains Mono", monospace';
  g.letterSpacing = '2px';
  g.globalAlpha = 0.78;
  g.fillText('WASHED', 26, 326);
  g.fillText('1 950 MASL', 26, 350);
  g.fillText('250 G — WHOLE BEAN', 26, 374);
  g.globalAlpha = 1;

  g.strokeStyle = 'rgba(240,230,216,0.22)';
  g.lineWidth = 1;
  g.strokeRect(14, 14, W - 28, hh - 28);
  g.restore();

  // ---- right face (narrow) ------------------------------------------------
  g.save();
  g.translate(W, 0);
  g.fillStyle = 'rgba(0,0,0,0.10)';
  g.fillRect(0, 0, D, hh);
  g.translate(D / 2, hh / 2);
  g.rotate(-Math.PI / 2);
  g.fillStyle = BAG_INK;
  g.globalAlpha = 0.88;
  g.font = '400 12px "JetBrains Mono", monospace';
  g.letterSpacing = '3px';
  g.textAlign = 'center';
  g.fillText('ROASTED 04.09 — FILTER', 0, 4);
  g.restore();

  // ---- back face ----------------------------------------------------------
  g.save();
  g.translate(W + D, 0);
  g.fillStyle = BAG_INK;
  g.globalAlpha = 0.72;
  g.font = '400 12px "JetBrains Mono", monospace';
  g.letterSpacing = '2px';
  g.fillText('TASTING NOTES', 26, 56);
  g.globalAlpha = 1;

  g.fillStyle = BAG_ACCENT;
  g.font = '300 30px "Fraunces", Georgia, serif';
  g.letterSpacing = '0px';
  g.fillText('Peach · Jasmine', 26, 100);
  g.fillText('Black tea', 26, 136);

  // Body copy suggested as rules — legible as text at a glance, cheap to draw.
  g.fillStyle = 'rgba(240,230,216,0.3)';
  for (let i = 0; i < 7; i++) {
    const wdt = i === 6 ? W * 0.42 : W * (0.62 + ((i * 37) % 23) / 100);
    g.fillRect(26, 176 + i * 17, wdt, 3);
  }

  g.fillStyle = 'rgba(240,230,216,0.5)';
  for (let i = 0; i < 26; i++) {
    const bw = 1 + ((i * 13) % 4);
    g.fillRect(26 + i * 7, hh - 92, bw, 44);
  }

  g.fillStyle = BAG_INK;
  g.globalAlpha = 0.6;
  g.font = '400 11px "JetBrains Mono", monospace';
  g.fillText('5 601234 567890', 26, hh - 32);
  g.globalAlpha = 1;
  g.restore();

  // ---- left face (narrow) -------------------------------------------------
  g.save();
  g.translate(2 * W + D, 0);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(0, 0, D, hh);
  g.strokeStyle = BAG_ACCENT;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(D / 2, hh / 2, 26, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(D / 2 - 26, hh / 2);
  g.lineTo(D / 2 + 26, hh / 2);
  g.stroke();
  g.restore();

  return c;
}

/**
 * Mip chain for the label.
 *
 * Near edge-on, a face is a few pixels wide but still samples hundreds of
 * texels. Bilinear filtering alone cannot represent that, so the slices pick up
 * whatever texels they happen to land on — which produces vertical streaks that
 * crawl and flash as the rotation changes. Sampling from a pre-filtered smaller
 * copy instead is the standard answer, and it is what a GPU would do for us.
 */
export function createMipChain(
  base: HTMLCanvasElement,
  minWidth = 16,
): HTMLCanvasElement[] {
  const mips: HTMLCanvasElement[] = [base];
  let cur = base;
  while (cur.width > minWidth) {
    const w = Math.max(1, Math.floor(cur.width / 2));
    const h = Math.max(1, Math.floor(cur.height / 2));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // Halving step by step is a box-filter chain — averaging every texel that
    // contributes, rather than point-sampling the original once.
    g.drawImage(cur, 0, 0, w, h);
    mips.push(c);
    cur = c;
  }
  return mips;
}

interface Projected {
  x: number;
  scale: number;
  depth: number;
}

/**
 * Draw one frame. `angle` is the rotation about the vertical axis in radians;
 * everything else follows from it, so scrubbing is just calling this with a
 * different angle.
 */
export function drawBagFrame(
  ctx: CanvasRenderingContext2D,
  mips: HTMLCanvasElement[],
  cssW: number,
  cssH: number,
  angle: number,
) {
  const texture = mips[0];
  ctx.clearRect(0, 0, cssW, cssH);

  const cx = cssW / 2;
  const cy = cssH / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Project the four vertical edges.
  const pts: Projected[] = CORNERS.map(([x, z]) => {
    const rx = x * cos + z * sin;
    const rz = -x * sin + z * cos;
    const depth = rz + CAM;
    const scale = FOCAL / depth;
    return { x: cx + rx * scale, scale, depth };
  });

  // Contact shadow, sized to the silhouette.
  const left = Math.min(...pts.map((p) => p.x));
  const right = Math.max(...pts.map((p) => p.x));
  const baseScale = FOCAL / CAM;
  const footY = cy + (H / 2) * baseScale;
  ctx.save();
  const shadow = ctx.createRadialGradient(
    cx,
    footY,
    0,
    cx,
    footY,
    (right - left) * 0.62,
  );
  shadow.addColorStop(0, 'rgba(40,26,16,0.34)');
  shadow.addColorStop(1, 'rgba(40,26,16,0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(cx, footY + 12, (right - left) * 0.62, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Which faces point at us, farthest first.
  const faces: { i: number; j: number; depth: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const [nx, nz] = NORMALS[i];
    const nzr = -nx * sin + nz * cos;
    if (nzr >= 0) continue; // facing away
    const j = (i + 1) % 4;
    faces.push({ i, j, depth: (pts[i].depth + pts[j].depth) / 2 });
  }
  faces.sort((a, b) => b.depth - a.depth);

  const texW = texture.width;
  const FIN = 26;

  // Bilinear sampling matters here: every slice is a sub-pixel crop.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (const face of faces) {
    const p0 = pts[face.i];
    const p1 = pts[face.j];
    const u0 = FACE_U[face.i];
    const u1 = FACE_U[face.i + 1];
    const span = p1.x - p0.x;
    if (Math.abs(span) < 0.6) continue;

    const top0 = cy - (H / 2) * p0.scale;
    const top1 = cy - (H / 2) * p1.scale;
    const bot0 = cy + (H / 2) * p0.scale;
    const bot1 = cy + (H / 2) * p1.scale;

    /**
     * Step count follows whichever changes faster across the face: its width,
     * or its height. Near edge-on, a face is only a few pixels wide but its
     * two ends differ enormously in height — stepping by width alone would
     * approximate a steep trapezoid with a handful of rectangles and leave a
     * visible staircase.
     */
    /**
     * Pick the mip level where roughly one texel lands on one pixel. A face
     * squeezed to a sliver reads from a heavily pre-filtered copy instead of
     * aliasing against the full-resolution label.
     */
    const faceTexels = (u1 - u0) * texW;
    const ratio = faceTexels / Math.max(1, Math.abs(span));
    const level = Math.max(
      0,
      Math.min(mips.length - 1, Math.floor(Math.log2(Math.max(1, ratio)))),
    );
    const mip = mips[level];
    const mipK = mip.width / texW;

    const heightDelta = Math.abs(bot1 - bot0);
    const steps = Math.max(
      10,
      Math.min(420, Math.round(Math.max(Math.abs(span), heightDelta))),
    );

    ctx.save();
    // Clip to the exact quad; every slice below deliberately overshoots it.
    ctx.beginPath();
    ctx.moveTo(p0.x, top0);
    ctx.lineTo(p1.x, top1);
    ctx.lineTo(p1.x, bot1);
    ctx.lineTo(p0.x, bot0);
    ctx.closePath();
    ctx.clip();

    for (let k = 0; k < steps; k++) {
      const sA = k / steps;
      const sB = (k + 1) / steps;

      /**
       * Perspective-correct interpolation. Screen space is linear in 1/depth,
       * not in the texture coordinate, so a naive lerp would visibly "swim"
       * across the face. Weighting each end by its scale (which is ∝ 1/depth)
       * is the standard correction.
       */
      const uA = (sA * p1.scale) / (sA * p1.scale + (1 - sA) * p0.scale);
      const uB = (sB * p1.scale) / (sB * p1.scale + (1 - sB) * p0.scale);

      const txA = (u0 + (u1 - u0) * uA) * texW;
      const txB = (u0 + (u1 - u0) * uB) * texW;
      const sx = Math.min(txA, txB) * mipK;
      const sw = Math.max(0.5, Math.abs(txB - txA) * mipK);

      const dxA = p0.x + span * sA;
      const dxB = p0.x + span * sB;
      const dx = Math.min(dxA, dxB);

      /**
       * Two deliberate overshoots, both trimmed by the clip above:
       *  - one extra pixel of width, so neighbouring slices overlap instead of
       *    meeting on a fractional boundary and leaving a hairline seam;
       *  - the taller of the slice's two ends, so a slice can never fall short
       *    of the trapezoid and let the background through.
       */
      const dw = Math.abs(dxB - dxA) + 1;
      const scA = p0.scale + (p1.scale - p0.scale) * sA;
      const scB = p0.scale + (p1.scale - p0.scale) * sB;
      const hh = (H / 2) * Math.max(scA, scB);

      ctx.drawImage(mip, sx, 0, sw, mip.height, dx, cy - hh, dw, hh * 2);
    }
    ctx.restore();

    /**
     * Fin seal, drawn per face against that face's own top edge. Building it
     * as one polygon across corners belonging to different faces made its
     * edges disagree with the body underneath.
     */
    const fin0 = top0 - FIN * p0.scale;
    const fin1 = top1 - FIN * p1.scale;
    ctx.beginPath();
    ctx.moveTo(p0.x, top0);
    ctx.lineTo(p1.x, top1);
    ctx.lineTo(p1.x, fin1);
    ctx.lineTo(p0.x, fin0);
    ctx.closePath();
    ctx.fillStyle = '#20140e';
    ctx.fill();

    // Lambert-ish shading, applied to body and seal together so the seal is
    // lit as part of the same solid.
    const [nx, nz] = NORMALS[face.i];
    const nxr = nx * cos + nz * sin;
    const nzr = -nx * sin + nz * cos;
    const lit = Math.max(0, nxr * -0.42 + nzr * -0.91);
    const dark = (1 - lit) * 0.6;

    ctx.beginPath();
    ctx.moveTo(p0.x, fin0);
    ctx.lineTo(p1.x, fin1);
    ctx.lineTo(p1.x, bot1);
    ctx.lineTo(p0.x, bot0);
    ctx.closePath();
    ctx.fillStyle = `rgba(18,10,6,${dark.toFixed(3)})`;
    ctx.fill();

    // A single highlight along the crimp itself.
    ctx.beginPath();
    ctx.moveTo(p0.x, fin0);
    ctx.lineTo(p1.x, fin1);
    ctx.strokeStyle = `rgba(240,230,216,${(0.1 + lit * 0.14).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
