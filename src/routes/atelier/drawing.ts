/**
 * The building section drawn in the pinned scene: a glasshouse (a *verrière*)
 * cut through on axis. Ordered so that scrubbing the scene builds it the way
 * it would actually be drawn — ground, then structure, then envelope, then the
 * things that give it scale.
 *
 * Every entry is a path so it can carry `pathLength="1"`, which normalises the
 * dash animation regardless of the path's real length. Circles are written as
 * two arcs for the same reason.
 */

export interface SectionPath {
  d: string;
  /** Line weight role — maps to a stroke treatment in CSS. */
  w?: 'thin' | 'accent';
}

/** Circle as a path, so `pathLength` applies uniformly. */
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`;

export const SECTION_PATHS: SectionPath[] = [
  // --- datum ---------------------------------------------------------------
  { d: 'M0 660 H1400', w: 'thin' },

  // --- substructure --------------------------------------------------------
  { d: 'M180 660 V636 H1220 V660' },

  // --- envelope walls ------------------------------------------------------
  { d: 'M180 636 V320' },
  { d: 'M1220 636 V320' },
  { d: 'M212 636 V320', w: 'thin' },
  { d: 'M1188 636 V320', w: 'thin' },

  // --- horizontal structure ------------------------------------------------
  { d: 'M180 470 H1220' },
  { d: 'M212 482 H1188', w: 'thin' },
  { d: 'M212 320 H660' },
  { d: 'M660 320 V344' },

  // --- columns -------------------------------------------------------------
  { d: 'M423 636 V320' },
  { d: 'M437 636 V320' },
  { d: 'M693 636 V320' },
  { d: 'M707 636 V320' },
  { d: 'M963 636 V320' },
  { d: 'M977 636 V320' },

  // --- glazed roof ---------------------------------------------------------
  { d: 'M180 320 Q700 40 1220 320', w: 'accent' },
  { d: 'M212 320 Q700 78 1188 320', w: 'accent' },
  { d: 'M700 132 V180', w: 'accent' },

  // --- roof mullions -------------------------------------------------------
  { d: 'M284 270 V320', w: 'accent' },
  { d: 'M388 230 V320', w: 'accent' },
  { d: 'M492 202 V320', w: 'accent' },
  { d: 'M596 186 V320', w: 'accent' },
  { d: 'M700 180 V320', w: 'accent' },
  { d: 'M804 186 V320', w: 'accent' },
  { d: 'M908 202 V320', w: 'accent' },
  { d: 'M1012 230 V320', w: 'accent' },
  { d: 'M1116 270 V320', w: 'accent' },

  // --- stair ---------------------------------------------------------------
  {
    d: 'M880 636 H916 V608 H952 V580 H988 V552 H1024 V524 H1060 V496 H1096 V470 H1132',
    w: 'thin',
  },

  // --- openings ------------------------------------------------------------
  { d: 'M260 556 H360 V616 H260 Z', w: 'thin' },
  { d: 'M520 556 H620 V616 H520 Z', w: 'thin' },
  { d: 'M780 556 H860 V616 H780 Z', w: 'thin' },
  { d: 'M260 396 H360 V452 H260 Z', w: 'thin' },
  { d: 'M520 396 H620 V452 H520 Z', w: 'thin' },

  // --- figures, for scale --------------------------------------------------
  { d: circle(330, 596, 7), w: 'thin' },
  { d: 'M330 603 V626 M320 612 H340 M330 626 L322 640 M330 626 L338 640', w: 'thin' },
  { d: circle(560, 406, 7), w: 'thin' },
  { d: 'M560 413 V436 M550 422 H570 M560 436 L552 450 M560 436 L568 450', w: 'thin' },

  // --- landscape -----------------------------------------------------------
  { d: 'M90 660 V612', w: 'thin' },
  { d: circle(90, 592, 26), w: 'thin' },
  { d: 'M1320 660 V620', w: 'thin' },
  { d: circle(1320, 598, 22), w: 'thin' },

  // --- dimensions ----------------------------------------------------------
  { d: 'M180 700 V712 M1220 700 V712 M180 706 H1220', w: 'thin' },
  { d: 'M114 320 H126 M114 660 H126 M120 320 V660', w: 'thin' },
];

/** Annotations fade in rather than draw. */
export const SECTION_LABELS = [
  { x: 700, y: 150, text: 'Glazed roof — 42m span', anchor: 'middle' },
  { x: 240, y: 356, text: 'Mezzanine', anchor: 'start' },
  { x: 700, y: 730, text: '38.0 m', anchor: 'middle' },
  { x: 1240, y: 500, text: 'Stair to mezzanine', anchor: 'start' },
] as const;

/** Caption track, keyed to scrub progress. */
export const SECTION_STEPS = [
  {
    at: 0,
    title: 'Datum and substructure',
    body: 'The section begins where the building meets the ground — a continuous plinth set 24cm above the courtyard datum.',
  },
  {
    at: 0.3,
    title: 'Primary structure',
    body: 'Three pairs of cast columns carry the mezzanine and the roof springing, dividing the hall into four structural bays.',
  },
  {
    at: 0.58,
    title: 'The verrière',
    body: 'A shallow segmental vault of glass, 42 metres across, restored with the original mullion rhythm and a new thermal break.',
  },
  {
    at: 0.82,
    title: 'Occupation',
    body: 'Figures, stair and planting return the drawing to human scale — the reason the section is cut in the first place.',
  },
] as const;
