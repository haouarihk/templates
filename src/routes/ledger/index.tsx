import { component$, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

import styles from './index.css?inline';
import frameStyles from '../../components/case-frame/case-frame.css?inline';
import { CaseBar, CaseFooter } from '../../components/case-frame/case-frame';
import { bySlug } from '../../lib/site';

const STUDY = bySlug('ledger')!;

/* ------------------------------------------------------------------ chart */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Settled volume, € millions. One series — so no legend; the title names it. */
const VOLUME = [2.1, 2.4, 2.2, 2.9, 3.1, 3.4, 3.2, 3.8, 4.1, 4.6, 4.9, 5.4];

const CHART = {
  w: 520,
  baseline: 152,
  top: 30,
  left: 46,
  right: 512,
  max: 6,
};
const BAND = (CHART.right - CHART.left) / MONTHS.length;
const COL_W = 20; // capped well under the 24px ceiling; the rest is air
const yFor = (v: number) =>
  CHART.baseline - (v / CHART.max) * (CHART.baseline - CHART.top);

/** Rounded data-end, square at the baseline. */
const colPath = (x: number, v: number) => {
  const y = yFor(v);
  const h = CHART.baseline - y;
  const r = Math.min(4, h, COL_W / 2);
  return `M${x},${CHART.baseline} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} H${x + COL_W - r} A${r},${r} 0 0 1 ${x + COL_W},${y + r} V${CHART.baseline} Z`;
};

const ROWS = [
  { who: 'Stripe payouts', tag: 'ST', when: 'Today, 09:12', amt: '+€128,400.00', incoming: true },
  { who: 'Payroll — September', tag: 'PY', when: 'Today, 08:00', amt: '−€86,220.00', incoming: false },
  { who: 'FX sweep EUR → USD', tag: 'FX', when: 'Yesterday', amt: '−€40,000.00', incoming: false },
];

const STEPS = [
  {
    n: '1',
    title: 'Connect the accounts',
    body: 'Read-only bank and PSP connections across 38 currencies. No file drops, no nightly CSV, no bank portal logins shared around the finance team.',
  },
  {
    n: '2',
    title: 'Normalise every movement',
    body: 'Fees, FX legs, reversals and chargebacks are decomposed into double-entry postings against your own chart of accounts.',
  },
  {
    n: '3',
    title: 'Match automatically',
    body: 'Ninety-nine percent of lines reconcile without anyone looking. The rest arrive in a queue with the evidence already attached.',
  },
  {
    n: '4',
    title: 'Close in an afternoon',
    body: 'A signed, immutable period close with a full audit trail your accountants can open directly — instead of a spreadsheet emailed twice.',
  },
];

const Check = component$(() => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M2.5 7.5 5.5 10.5 11.5 4"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
));

export default component$(() => {
  useStyles$(frameStyles);
  useStyles$(styles);

  // Deliberately no useVisibleTask$, no scroll listener, no rAF. Every motion
  // on this page is a CSS scroll-timeline driven by the browser's own scroll.

  return (
    <div class="ld">
      <a class="skip-link" href="#ld-main">
        Skip to content
      </a>
      <CaseBar study={STUDY} />

      <div class="ld-progress" aria-hidden="true">
        <div class="ld-progress__fill" />
      </div>

      <main id="ld-main">
        {/* ---------------------------------------------------- hero */}
        <section class="ld-hero">
          <div>
            <div class="ld-eyebrow">
              <i />
              Treasury operations
            </div>
            <h1>
              Close the books <em>while the month is still running.</em>
            </h1>
            <p>
              Ledger reconciles every payment, payout and FX leg across your
              banks and processors continuously — so month-end is a review, not
              a reconstruction.
            </p>
            <div class="ld-cta">
              <a class="ld-btn ld-btn--primary" href="#ld-pricing">
                Start free
                <span aria-hidden="true">→</span>
              </a>
              <a class="ld-btn ld-btn--ghost" href="#ld-how">
                See how it works
              </a>
            </div>
            <div class="ld-trust">
              <span>SOC 2 Type II</span>
              <span>PSD2 compliant</span>
              <span>38 currencies</span>
              <span>No card required</span>
            </div>
          </div>

          {/* ------------------------------------------- dashboard */}
          <div class="ld-card ld-reveal">
            <div class="ld-card__bar">
              <span class="ld-card__dot" />
              <span class="ld-card__dot" />
              <span class="ld-card__dot" />
              <span class="ld-card__title">Treasury — September 2026</span>
            </div>
            <div class="ld-card__body">
              <div class="ld-stat__label">Cash across all accounts</div>
              <div class="ld-stat__value">€42,184,900</div>
              <div class="ld-stat__delta">
                ▲ 12.4% <span>vs August</span>
              </div>

              <figure class="ld-chart">
                <figcaption class="visually-hidden" id="ld-chart-title">
                  Settled volume by month, 2026, in millions of euro.
                </figcaption>
                <svg
                  viewBox={`0 0 ${CHART.w} 190`}
                  role="img"
                  aria-labelledby="ld-chart-title"
                >
                  {/* Gridlines and ticks — hairline, solid, recessive. */}
                  {[0, 2, 4, 6].map((v) => (
                    <g key={v}>
                      <line
                        class="grid"
                        x1={CHART.left}
                        y1={yFor(v)}
                        x2={CHART.right}
                        y2={yFor(v)}
                      />
                      <text
                        class="tick"
                        x={CHART.left - 10}
                        y={yFor(v) + 3}
                        text-anchor="end"
                      >
                        {v}
                      </text>
                    </g>
                  ))}
                  <text class="tick" x={CHART.left - 10} y={16} text-anchor="end">
                    €M
                  </text>

                  {VOLUME.map((v, i) => {
                    const x = CHART.left + i * BAND + (BAND - COL_W) / 2;
                    const cx = x + COL_W / 2;
                    const isLast = i === VOLUME.length - 1;
                    return (
                      <g class="ld-bar" key={MONTHS[i]}>
                        <title>{`${MONTHS[i]}: €${v.toFixed(1)}M settled`}</title>
                        {/* Hit area is the whole band, not just the column. */}
                        <rect
                          class="ld-bar__hit"
                          x={CHART.left + i * BAND}
                          y={CHART.top - 12}
                          width={BAND}
                          height={CHART.baseline - CHART.top + 30}
                        />
                        <path class="col" d={colPath(x, v)} />

                        {/* Only the final column is directly labelled. */}
                        {isLast && (
                          <text
                            class="label"
                            x={cx}
                            y={yFor(v) - 8}
                            text-anchor="middle"
                          >
                            €{v.toFixed(1)}M
                          </text>
                        )}

                        <g class="ld-bar__tip">
                          <rect
                            x={cx - 30}
                            y={yFor(v) - 30}
                            width="60"
                            height="20"
                            rx="5"
                          />
                          <text x={cx} y={yFor(v) - 16} text-anchor="middle">
                            {MONTHS[i]} €{v.toFixed(1)}M
                          </text>
                        </g>

                        <text
                          class="tick"
                          x={cx}
                          y={CHART.baseline + 15}
                          text-anchor="middle"
                        >
                          {MONTHS[i].charAt(0)}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Table view, so nothing is gated behind hover or colour. */}
                <table class="visually-hidden">
                  <caption>Settled volume by month, 2026 (€M)</caption>
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">Settled volume (€M)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VOLUME.map((v, i) => (
                      <tr key={MONTHS[i]}>
                        <th scope="row">{MONTHS[i]}</th>
                        <td>{v.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </figure>

              <div class="ld-rows">
                {ROWS.map((r) => (
                  <div class="ld-row" key={r.who}>
                    <div class="ld-row__who">
                      <span class="ld-row__avatar" aria-hidden="true">
                        {r.tag}
                      </span>
                      <span>
                        {r.who}
                        <br />
                        <span style="color:var(--muted);font-size:11px">
                          {r.when}
                        </span>
                      </span>
                    </div>
                    <span
                      class={
                        r.incoming
                          ? 'ld-row__amt ld-row__amt--in'
                          : 'ld-row__amt'
                      }
                    >
                      {r.amt}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------ sticky flow */}
        <section class="ld-flow" id="ld-how">
          <div class="ld-flow__inner">
            <div class="ld-flow__aside">
              <div class="ld-kicker">How it works</div>
              <h2 class="ld-h2">Four steps, and none of them is a spreadsheet.</h2>
              <p class="ld-sub">
                This panel is held in place with <code>position: sticky</code>,
                and each card lights up over its own slice of the section's
                scroll progress. No script is involved in either.
              </p>
            </div>

            <ol class="ld-flow__steps">
              {STEPS.map((s) => (
                <li class="ld-step" key={s.n}>
                  <span class="ld-step__n">{s.n}</span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* --------------------------------------------- metrics */}
        <section class="ld-section">
          <div class="ld-kicker ld-reveal">By the numbers</div>
          <h2 class="ld-h2 ld-reveal">Measured across 340 finance teams.</h2>
          <dl class="ld-metrics ld-reveal">
            <div class="ld-metric">
              <dt>Volume settled in 2026</dt>
              <dd>
                €<span class="ld-count" style="--ld-n:42" />M
              </dd>
            </div>
            <div class="ld-metric">
              <dt>Reconciled automatically</dt>
              <dd>
                <span class="ld-count" style="--ld-n:99" />%
              </dd>
            </div>
            <div class="ld-metric">
              <dt>Currencies supported</dt>
              <dd>
                <span class="ld-count" style="--ld-n:38" />
              </dd>
            </div>
            <div class="ld-metric">
              <dt>Month-end close</dt>
              <dd>
                <span class="ld-count" style="--ld-n:6" /> hrs
              </dd>
            </div>
          </dl>
        </section>

        {/* --------------------------------------------- pricing */}
        <section class="ld-section ld-pricing" id="ld-pricing">
          <div class="ld-kicker ld-reveal">Pricing</div>
          <h2 class="ld-h2 ld-reveal">Priced on volume, not on seats.</h2>

          <input
            type="radio"
            name="ld-cycle"
            id="ld-monthly"
            class="visually-hidden"
            checked
          />
          <input
            type="radio"
            name="ld-cycle"
            id="ld-annual"
            class="visually-hidden"
          />
          <div class="ld-pricing__switch" role="group" aria-label="Billing period">
            <label for="ld-monthly">Monthly</label>
            <label for="ld-annual">Annual — save 15%</label>
          </div>

          <div class="ld-plans">
            <div class="ld-plan ld-reveal">
              <div class="ld-plan__name">Starter</div>
              <div class="ld-plan__price">€0</div>
              <ul>
                <li>
                  <Check /> Up to €50k settled monthly
                </li>
                <li>
                  <Check /> Two connected accounts
                </li>
                <li>
                  <Check /> Continuous reconciliation
                </li>
              </ul>
              <a class="ld-btn ld-btn--ghost" href="#ld-pricing">
                Start free
              </a>
            </div>

            <div class="ld-plan ld-plan--featured ld-reveal">
              <div class="ld-plan__name">Growth</div>
              <div class="ld-plan__price">
                <span class="ld-price--monthly">€390</span>
                <span class="ld-price--annual">€329</span>
                <small> / month</small>
              </div>
              <ul>
                <li>
                  <Check /> Up to €5M settled monthly
                </li>
                <li>
                  <Check /> Unlimited accounts and entities
                </li>
                <li>
                  <Check /> Multi-currency close and FX attribution
                </li>
                <li>
                  <Check /> Audit export and period locking
                </li>
              </ul>
              <a class="ld-btn ld-btn--primary" href="#ld-pricing">
                Start 30-day trial
              </a>
            </div>

            <div class="ld-plan ld-reveal">
              <div class="ld-plan__name">Scale</div>
              <div class="ld-plan__price">Custom</div>
              <ul>
                <li>
                  <Check /> Unlimited volume
                </li>
                <li>
                  <Check /> Dedicated ledger shard and SLA
                </li>
                <li>
                  <Check /> SSO, SCIM and audit residency
                </li>
              </ul>
              <a class="ld-btn ld-btn--ghost" href="#ld-pricing">
                Talk to us
              </a>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ note */}
        <section class="ld-section ld-note">
          <div class="ld-note__inner">
            <div class="ld-kicker">Why this one is different</div>
            <h2 class="ld-h2">The case for leaving scroll alone.</h2>
            <p>
              Every other page in this portfolio suppresses native scrolling and
              repaints the document with a transform. This one does not run a
              single line of scroll JavaScript. The progress bar is{' '}
              <code>animation-timeline: scroll(root block)</code>; the cards use{' '}
              <code>view()</code>; the counters animate a registered custom
              property; the billing toggle is a radio group and{' '}
              <code>:has()</code>.
            </p>
            <p>
              <strong>That is a deliberate recommendation, not a shortcut.</strong>{' '}
              A treasury product is used every day by people who need
              find-in-page, middle-click, keyboard paging and their own
              scrollbar to behave exactly as the operating system taught them.
              Buying a few seconds of delight at the cost of that is a bad trade.
            </p>
            <p>
              It is also the fastest page here: the effects run off the
              compositor with no main-thread work, so nothing can jank, and
              because the animated state is wrapped in{' '}
              <code>@supports</code>, a browser without scroll-timelines is
              handed the finished page rather than a broken one.
            </p>
          </div>
        </section>

        <CaseFooter study={STUDY} />
      </main>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Ledger — Treasury operations, reconciled continuously',
  meta: [
    {
      name: 'description',
      content:
        'Case study: a landing page animated entirely by native CSS scroll-timelines — no scroll library, no rAF loop, no main-thread work.',
    },
  ],
  links: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
    },
  ],
};
