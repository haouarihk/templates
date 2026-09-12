/**
 * Lookbook imagery, generated rather than photographed.
 *
 * Each "look" is painted once into a 2D canvas and handed to Three.js as a
 * texture. Procedural means the page ships no image bytes, every look is
 * deterministic, and the art direction is a set of numbers we can tune rather
 * than an asset pipeline.
 */

export interface Look {
  id: string;
  no: string;
  name: string;
  fabric: string;
  colourway: string;
  /** Two-tone palette: ground, then figure. */
  palette: [string, string];
  accent: string;
  seed: number;
}

export const LOOKS: Look[] = [
  {
    id: 'look-01',
    no: '01',
    name: 'Draped shoulder coat',
    fabric: 'Boiled wool, 720 gsm',
    colourway: 'Ash / Oxblood',
    palette: ['#1b1b1e', '#6d2230'],
    accent: '#ff2d55',
    seed: 9137,
  },
  {
    id: 'look-02',
    no: '02',
    name: 'Bias column dress',
    fabric: 'Sandwashed silk',
    colourway: 'Bone',
    palette: ['#141414', '#b9ad9c'],
    accent: '#ff2d55',
    seed: 4421,
  },
  {
    id: 'look-03',
    no: '03',
    name: 'Panelled trouser',
    fabric: 'Dry cotton twill',
    colourway: 'Slate',
    palette: ['#0f1418', '#40525e'],
    accent: '#ff2d55',
    seed: 7714,
  },
  {
    id: 'look-04',
    no: '04',
    name: 'Cropped moto jacket',
    fabric: 'Vegetable-tanned calf',
    colourway: 'Jet',
    palette: ['#101010', '#33333a'],
    accent: '#ff2d55',
    seed: 2288,
  },
  {
    id: 'look-05',
    no: '05',
    name: 'Sheer overlay shirt',
    fabric: 'Silk organza',
    colourway: 'Signal',
    palette: ['#160a0e', '#8e2438'],
    accent: '#ff2d55',
    seed: 5563,
  },
];

/** Film grain, built once and reused as a compositable tile. */
let grainTile: HTMLCanvasElement | null = null;
function getGrainTile(size = 256): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 90 + Math.random() * 76;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/**
 * Paint one look. Deliberately abstract — a lit ground, a draped figure built
 * from bezier ribbons, grain and a caption — which reads as editorial imagery
 * without pretending to be a photograph.
 */
export function paintLook(look: Look, w = 900, h = 1200): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;

  let s = look.seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const [ground, figure] = look.palette;

  // --- ground --------------------------------------------------------------
  g.fillStyle = ground;
  g.fillRect(0, 0, w, h);

  const light = g.createRadialGradient(
    w * (0.32 + rnd() * 0.24),
    h * 0.3,
    0,
    w * 0.5,
    h * 0.5,
    h * 0.92,
  );
  light.addColorStop(0, 'rgba(255,255,255,0.17)');
  light.addColorStop(0.55, 'rgba(255,255,255,0.03)');
  light.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = light;
  g.fillRect(0, 0, w, h);

  // --- the figure, as a drape ---------------------------------------------
  const cx = w * 0.5;
  const top = h * 0.16;
  const bottom = h * 0.94;
  const width = w * (0.3 + rnd() * 0.08);

  g.save();
  g.beginPath();
  g.moveTo(cx - width * 0.42, top);
  g.bezierCurveTo(
    cx - width * (0.9 + rnd() * 0.3), h * 0.42,
    cx - width * (0.6 + rnd() * 0.35), h * 0.7,
    cx - width * 0.75, bottom,
  );
  g.lineTo(cx + width * 0.75, bottom);
  g.bezierCurveTo(
    cx + width * (0.6 + rnd() * 0.35), h * 0.7,
    cx + width * (0.9 + rnd() * 0.3), h * 0.42,
    cx + width * 0.42, top,
  );
  g.closePath();
  g.fillStyle = figure;
  g.fill();

  const cloth = g.createLinearGradient(cx - width, 0, cx + width, h);
  cloth.addColorStop(0, 'rgba(255,255,255,0.14)');
  cloth.addColorStop(0.5, 'rgba(255,255,255,0.02)');
  cloth.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.globalCompositeOperation = 'overlay';
  g.fillStyle = cloth;
  g.fill();
  g.restore();

  // Fold lines running down the drape.
  g.save();
  g.globalCompositeOperation = 'soft-light';
  g.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const x = cx + (t - 0.5) * width * 1.5;
    g.strokeStyle = `rgba(255,255,255,${(0.06 + rnd() * 0.14).toFixed(3)})`;
    g.beginPath();
    g.moveTo(x, top + rnd() * 80);
    g.bezierCurveTo(
      x - 40 + rnd() * 80, h * 0.5,
      x + 30 - rnd() * 60, h * 0.72,
      x + (rnd() - 0.5) * 60, bottom,
    );
    g.stroke();
  }
  g.restore();

  // --- grain ---------------------------------------------------------------
  // Composited, not written straight into the buffer: putImageData replaces
  // pixels outright and would erase everything above.
  g.save();
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.16;
  const tile = getGrainTile();
  for (let y = 0; y < h; y += tile.height) {
    for (let x = 0; x < w; x += tile.width) g.drawImage(tile, x, y);
  }
  g.restore();

  // --- vignette ------------------------------------------------------------
  const vig = g.createRadialGradient(
    w / 2, h / 2, h * 0.3,
    w / 2, h / 2, h * 0.8,
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);

  // --- caption (kept above the grain so it stays crisp) --------------------
  g.fillStyle = look.accent;
  g.fillRect(w * 0.08, h * 0.075, w * 0.1, 6);

  g.fillStyle = 'rgba(245,245,245,0.92)';
  g.font = '500 26px "JetBrains Mono", monospace';
  g.letterSpacing = '6px';
  g.fillText(`LOOK ${look.no}`, w * 0.08, h * 0.075 - 22);

  g.globalAlpha = 0.66;
  g.font = '400 20px "JetBrains Mono", monospace';
  g.letterSpacing = '3px';
  g.fillText(look.colourway.toUpperCase(), w * 0.08, h * 0.955);
  g.globalAlpha = 1;

  return c;
}
