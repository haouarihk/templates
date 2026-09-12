/**
 * Single source of truth for the studio identity and the case-study registry.
 * The showcase grid, the page-to-page navigation and the meta tags all read
 * from here, so rebranding or reordering the work is a one-file change.
 */

export const STUDIO = {
  /** The handle. CSS uppercases it where the lockup calls for it. */
  name: 'haouarihk',
  tagline: 'Scroll, rebuilt from scratch.',
  description:
    'I build custom scroll engines — landing pages that replace the browser’s scrollbar with something worth scrolling.',
  email: 'haithem2001@gmail.com',
  /** Shown in the page footers, so the handle has a person behind it. */
  principal: 'Haitam',
  location: 'Remote — CET',
} as const;

export type EngineKind = 'virtual' | 'native';

export interface CaseStudy {
  /** Route slug — also the folder name under src/routes. */
  slug: string;
  /** Index shown in the grid, e.g. "01". */
  index: string;
  /** The fictional client. */
  client: string;
  /** Industry this demonstrates. */
  field: string;
  /** One-line pitch for the card. */
  summary: string;
  /** The libraries and techniques that drive the page. */
  stack: string[];
  /** Whether native scroll is suppressed or deliberately left alone. */
  engine: EngineKind;
  /** The specific scroll technique headline. */
  technique: string;
  /** Card + page accent. */
  accent: string;
  /** Card background. */
  bg: string;
  /** Card foreground. */
  ink: string;
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: 'atelier',
    index: '01',
    client: 'Atelier Verrière',
    field: 'Architecture',
    summary:
      'An architecture practice whose portfolio unfolds like a building section — pinned scenes, a horizontal gallery, drawings that assemble as you descend.',
    stack: ['Lenis', 'GSAP ScrollTrigger', 'SVG'],
    engine: 'virtual',
    technique: 'Pinned scenes + horizontal scroll',
    accent: '#b89a6a',
    bg: '#12100d',
    ink: '#efe9dd',
  },
  {
    slug: 'roast',
    index: '02',
    client: 'Meridian Roasters',
    field: 'Specialty coffee — commerce',
    summary:
      'A single-origin storefront where scroll position scrubs a rendered product sequence frame by frame, and the bag turns in your hands.',
    stack: ['Custom engine', 'Canvas 2D', 'Frame scrubbing'],
    engine: 'virtual',
    technique: 'Scroll-scrubbed image sequence',
    accent: '#c2622b',
    bg: '#f4efe6',
    ink: '#20160f',
  },
  {
    slug: 'flux',
    index: '03',
    client: 'FLUX',
    field: 'Fashion',
    summary:
      'A ready-to-wear label whose lookbook lives in WebGL. Scroll velocity feeds a displacement shader, so the imagery bows and tears the harder you throw the page.',
    stack: ['Three.js', 'GLSL', 'DOM-synced planes'],
    engine: 'virtual',
    technique: 'Velocity-driven displacement shader',
    accent: '#ff2d55',
    bg: '#0a0a0a',
    ink: '#f5f5f5',
  },
  {
    slug: 'pulse',
    index: '04',
    client: 'Pulse Festival',
    field: 'Music & events',
    summary:
      'Three days of live music where the lineup is a rigid-body simulation. Scroll hard and the names pile up, collide and settle.',
    stack: ['Motion One', 'Matter.js', 'Rigid-body physics'],
    engine: 'virtual',
    technique: 'Scroll velocity → physics impulse',
    accent: '#ccff00',
    bg: '#0d0618',
    ink: '#f2ecff',
  },
  {
    slug: 'ledger',
    index: '05',
    client: 'Ledger',
    field: 'Fintech — SaaS',
    summary:
      'The counterpoint. Native scroll, untouched, animated entirely by CSS scroll-timelines. No scroll library, no rAF loop, no main-thread work.',
    stack: ['CSS scroll-timeline', 'view()', 'Zero JS'],
    engine: 'native',
    technique: 'Native CSS scroll-driven animation',
    accent: '#3d6bff',
    bg: '#ffffff',
    ink: '#0b1020',
  },
];

export const bySlug = (slug: string) =>
  CASE_STUDIES.find((c) => c.slug === slug);

/** Wraps around, so the last case study links back to the first. */
export const nextStudy = (slug: string) => {
  const i = CASE_STUDIES.findIndex((c) => c.slug === slug);
  return CASE_STUDIES[(i + 1) % CASE_STUDIES.length];
};
