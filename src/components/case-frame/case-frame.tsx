import { component$ } from '@builder.io/qwik';
import { STUDIO, nextStudy, type CaseStudy } from '../../lib/site';

/**
 * Fixed bar at the top of every case study: a way back to the index, plus the
 * engine and stack this particular page is demonstrating. Lives outside any
 * transformed layer so `position: fixed` still resolves to the viewport.
 */
export const CaseBar = component$<{ study: CaseStudy }>(({ study }) => (
  <div class="cf-bar">
    <a class="cf-back" href="/">
      <span aria-hidden="true">←</span>
      {STUDIO.name} index
    </a>
    <div class="cf-tag">
      <i data-engine={study.engine}>
        {study.engine === 'virtual' ? 'Virtual scroll' : 'Native scroll'}
      </i>
      {study.stack.map((tool) => (
        <i key={tool}>{tool}</i>
      ))}
    </div>
  </div>
));

/**
 * Tail of every case study — on to the next one, then credits. Sits inside the
 * scrolling content.
 */
export const CaseFooter = component$<{ study: CaseStudy }>(({ study }) => {
  const next = nextStudy(study.slug);
  return (
    <>
      <a class="cf-next" href={`/${next.slug}/`}>
        <div class="cf-next__label">Next case — {next.index}</div>
        <div class="cf-next__title">
          <span>{next.client}</span>
          <em>
            {next.technique} <span class="cf-next__arrow">→</span>
          </em>
        </div>
      </a>
      <footer class="cf-credits">
        <span>
          {study.index} — {study.client}
        </span>
        <span>{study.technique}</span>
        <a href={`mailto:${STUDIO.email}`}>{STUDIO.email}</a>
      </footer>
    </>
  );
});
