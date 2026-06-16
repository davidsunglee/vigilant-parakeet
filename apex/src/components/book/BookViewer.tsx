import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IStoryManifest } from '../../types/story.types';
import { CatalogService } from '../../services/CatalogService';
import { buildViews, BookView } from './views';
import { BookCover } from './BookCover';
import { StorySpread } from './StorySpread';
import { BookPage } from './BookPage';
import { TaleOfTheTape } from './TaleOfTheTape';
import { Verdict } from './Verdict';
import { ClosingPage } from './ClosingPage';
import { ReaderChrome } from './ReaderChrome';
import './BookViewer.css';

const NARROW_QUERY = '(max-width: 720px)';

function labelFor(view: BookView): string {
  switch (view.kind) {
    case 'cover': return 'Cover';
    case 'spread': return view.title;
    case 'page': return view.title || '';
    case 'showdown': return 'The Showdown';
    case 'tape': return 'Tale of the Tape';
    case 'verdict': return 'The Verdict';
    case 'closing': return 'The End';
  }
}

function renderView(
  view: BookView,
  story: IStoryManifest,
  signed: Record<string, string>,
  onReadAgain: () => void,
  onClose: () => void,
) {
  switch (view.kind) {
    case 'cover':
      return <BookCover manifest={story} signed={signed} />;
    case 'spread':
      return (
        <StorySpread
          title={view.title}
          left={view.left}
          right={view.right}
          leftFolio={view.leftFolio}
          rightFolio={view.rightFolio}
          signed={signed}
          leftAlt={story.animalA.commonName}
          rightAlt={story.animalB.commonName}
        />
      );
    case 'page':
      return (
        <div className="rd-single">
          <BookPage
            page={view.page}
            folio={view.folio}
            side={view.page.isLeftPage ? 'left' : 'right'}
            title={view.title || undefined}
            signedUrl={view.page.imageUrl ? signed[view.page.imageUrl] : undefined}
            imageAlt={view.page.isLeftPage ? story.animalA.commonName : story.animalB.commonName}
          />
        </div>
      );
    case 'showdown': {
      const url = view.page.imageUrl ? signed[view.page.imageUrl] : undefined;
      return (
        <div className="rd-showdown">
          {url && (
            <img src={url} alt="The showdown" className="rd-showdown-img" loading="lazy" decoding="async" />
          )}
          <div className="rd-showdown-scrim" aria-hidden="true" />
          <div className="rd-showdown-caption">
            <span className="rd-showdown-kicker">The Showdown</span>
            <p>{view.page.bodyText}</p>
          </div>
        </div>
      );
    }
    case 'tape':
      return <TaleOfTheTape manifest={story} />;
    case 'verdict':
      return <Verdict manifest={story} outcomePage={view.outcomePage} signed={signed} />;
    case 'closing':
      return <ClosingPage manifest={story} onReadAgain={onReadAgain} onClose={onClose} />;
  }
}

export const BookViewer: React.FC<{ storyId: string; onClose: () => void }> = ({ storyId, onClose }) => {
  const [story, setStory] = useState<IStoryManifest | null>(null);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches,
  );
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const record = await CatalogService.getStory(storyId);
      if (!active || !record.manifest) return;
      const manifest = record.manifest;
      setStory(manifest);

      const paths: string[] = [];
      if (manifest.coverImageUrl) paths.push(manifest.coverImageUrl);
      for (const page of manifest.pages) {
        if (page.imageUrl) paths.push(page.imageUrl);
      }
      if (paths.length > 0) {
        const map = await CatalogService.resolveSignedUrls(paths);
        if (active) setSigned(map);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [storyId]);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const views: BookView[] = useMemo(() => (story ? buildViews(story, narrow) : []), [story, narrow]);

  useEffect(() => {
    setIndex((i) => Math.max(0, Math.min(i, views.length - 1)));
  }, [views.length]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIndex((i) => Math.max(0, Math.min(views.length - 1, i + 1))),
    [views.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, onClose]);

  if (!story) {
    return (
      <div className="rd reader--journal rd-loading" role="status">
        <div className="rd-loading-emblem" aria-hidden="true">&amp;</div>
        <p className="rd-loading-text">Opening the book...</p>
        <div className="rd-loading-shimmer" aria-hidden="true" />
      </div>
    );
  }

  const view = views[index];
  const matchup = `${story.animalA.commonName} & ${story.animalB.commonName}`;
  const position = `${index + 1} / ${views.length}`;
  const progressPct = views.length > 1 ? (index / (views.length - 1)) * 100 : 0;

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.changedTouches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx > 50) goPrev();
    else if (dx < -50) goNext();
    touchX.current = null;
  };

  return (
    <div className="rd reader--journal">
      <div className="rd-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="rd-view" key={index}>
          {renderView(view, story, signed, () => setIndex(0), onClose)}
        </div>
      </div>
      <ReaderChrome
        matchup={matchup}
        label={labelFor(view)}
        position={position}
        progressPct={progressPct}
        canPrev={index > 0}
        canNext={index < views.length - 1}
        onBack={onClose}
        onPrev={goPrev}
        onNext={goNext}
      />
    </div>
  );
};
