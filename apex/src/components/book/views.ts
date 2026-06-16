import { IStoryManifest, IPageContent } from '../../types/story.types';

export type BookView =
  | { kind: 'cover' }
  | {
      kind: 'spread';
      title: string;
      left: IPageContent;
      right: IPageContent | null;
      leftFolio: number;
      rightFolio: number | null;
    }
  | { kind: 'page'; title: string; page: IPageContent; folio: number }
  | { kind: 'showdown'; page: IPageContent }
  | { kind: 'tape' }
  | { kind: 'verdict'; outcomePage: IPageContent | null }
  | { kind: 'closing' };

const SHOWDOWN_INDEX = 31;
const OUTCOME_INDEX = 32;

/**
 * Turns a manifest into the ordered sequence of reader views. In `singlePage`
 * mode (narrow viewports) each chapter becomes two single-page views; otherwise
 * each chapter is one two-page spread. Folios number the chapter pages from 1 in
 * reading order, independent of the manifest `index`.
 */
export function buildViews(manifest: IStoryManifest, singlePage = false): BookView[] {
  const showdown = manifest.pages.find((p) => p.index === SHOWDOWN_INDEX) ?? null;
  const outcomePage = manifest.pages.find((p) => p.index === OUTCOME_INDEX) ?? null;
  const chapterPages = manifest.pages.filter(
    (p) => p.index !== SHOWDOWN_INDEX && p.index !== OUTCOME_INDEX,
  );

  const views: BookView[] = [{ kind: 'cover' }];

  let folio = 1;
  for (let i = 0; i < chapterPages.length; i += 2) {
    const left = chapterPages[i];
    const right = chapterPages[i + 1] ?? null;
    const title = left.title || (right ? right.title : '');

    if (singlePage) {
      views.push({ kind: 'page', title, page: left, folio });
      folio += 1;
      if (right) {
        views.push({ kind: 'page', title: '', page: right, folio });
        folio += 1;
      }
    } else {
      views.push({
        kind: 'spread',
        title,
        left,
        right,
        leftFolio: folio,
        rightFolio: right ? folio + 1 : null,
      });
      folio += right ? 2 : 1;
    }
  }

  if (showdown) views.push({ kind: 'showdown', page: showdown });
  views.push({ kind: 'tape' });
  views.push({ kind: 'verdict', outcomePage });
  views.push({ kind: 'closing' });

  return views;
}
