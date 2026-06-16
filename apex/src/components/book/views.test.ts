import { describe, it, expect } from 'vitest';
import { buildViews } from './views';
import { createMockStory } from '../../test/fixtures';
import { IPageContent } from '../../types/story.types';

function page(index: number, isLeftPage: boolean, title = ''): IPageContent {
  return { index, title, bodyText: `body ${index}`, visualPrompt: `prompt ${index}`, isLeftPage };
}

// A manifest with two chapters (4 pages), a showdown (31) and an outcome (32).
function manifest() {
  return createMockStory({
    pages: [
      page(1, true, 'Meet the Animal'),
      page(2, false),
      page(3, true, 'Where It Lives'),
      page(4, false),
      page(31, true, 'The Showdown'),
      page(32, false, 'Outcome'),
    ],
  });
}

describe('buildViews', () => {
  it('opens on the cover and ends on the closing page', () => {
    const views = buildViews(manifest());
    expect(views[0].kind).toBe('cover');
    expect(views[views.length - 1].kind).toBe('closing');
  });

  it('pairs chapter pages into spreads with sequential folios (wide mode)', () => {
    const views = buildViews(manifest());
    const spreads = views.filter((v) => v.kind === 'spread');
    expect(spreads).toHaveLength(2);
    expect(spreads[0]).toMatchObject({ title: 'Meet the Animal', leftFolio: 1, rightFolio: 2 });
    expect(spreads[1]).toMatchObject({ title: 'Where It Lives', leftFolio: 3, rightFolio: 4 });
  });

  it('expands chapters into single pages with sequential folios (narrow mode)', () => {
    const views = buildViews(manifest(), true);
    const pages = views.filter((v) => v.kind === 'page');
    expect(pages).toHaveLength(4);
    expect(pages.map((v) => (v.kind === 'page' ? v.folio : 0))).toEqual([1, 2, 3, 4]);
    // The left page of a chapter carries the title; the right page does not.
    expect(pages[0]).toMatchObject({ title: 'Meet the Animal' });
    expect(pages[1]).toMatchObject({ title: '' });
  });

  it('places the showdown, then the tape, verdict (with the outcome page), then closing', () => {
    const views = buildViews(manifest());
    const kinds = views.map((v) => v.kind);
    expect(kinds.slice(-4)).toEqual(['showdown', 'tape', 'verdict', 'closing']);
    const verdict = views.find((v) => v.kind === 'verdict');
    expect(verdict && verdict.kind === 'verdict' && verdict.outcomePage?.index).toBe(32);
  });
});
