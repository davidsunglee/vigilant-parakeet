import { useEffect, useRef } from 'react';
import { BookOpen, ChevronLeft, RefreshCw, Trash2 } from 'lucide-react';
import { StoryRecord } from '../../types/story.types';
import { describeProgress } from './describeProgress';
import './PressRoom.css';

export interface PressRoomProps {
  story: StoryRecord;
  coverUrl?: string;
  onReadStory: (id: string) => void;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function PressRoom({ story, coverUrl, onReadStory, onRetry, onDelete, onClose }: PressRoomProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleText = story.title ?? `${story.animal_a} vs ${story.animal_b}`;
  const view = describeProgress(story.status, story.progress);

  // Focus the room on open; restore focus to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="press-room"
      role="dialog"
      aria-modal="true"
      aria-label={`Press Room: ${titleText}`}
      ref={rootRef}
      tabIndex={-1}
    >
      <div className="pr-top">
        <button type="button" className="pr-back" onClick={onClose}>
          <ChevronLeft size={16} aria-hidden="true" /> Reading Room
        </button>
        <span className="pr-runtitle">
          {story.animal_a} <span className="pr-amp" aria-hidden="true">&amp;</span> {story.animal_b}
        </span>
        <span className="pr-pub">An Apex Publication</span>
      </div>

      {story.status === 'failed' ? (
        <div className="pr-stage">
          <p className="pr-fresh">The press jammed</p>
          <p className="pr-jam" role="alert">
            This matchup did not come together. {story.error ?? 'Unknown error'}
          </p>
          <div className="pr-ctas">
            <button type="button" className="pr-read" onClick={() => onRetry(story.id)}>
              <RefreshCw size={15} aria-hidden="true" /> Try again
            </button>
            <button type="button" className="pr-ghost" onClick={() => onDelete(story.id)}>
              <Trash2 size={14} aria-hidden="true" /> Remove
            </button>
          </div>
        </div>
      ) : story.status === 'ready' ? (
        <div className="pr-stage">
          <p className="pr-fresh">Hot off the press</p>
          <div className="pr-cover">
            {coverUrl ? (
              <img className="pr-cover-img" src={coverUrl} alt={`${story.animal_a} vs ${story.animal_b}`} />
            ) : (
              <div className="pr-cover-wait" aria-hidden="true" />
            )}
          </div>
          <div className="pr-ctas">
            <button type="button" className="pr-read" onClick={() => onReadStory(story.id)}>
              <BookOpen size={15} aria-hidden="true" /> Read the book
            </button>
            <button type="button" className="pr-ghost" onClick={onClose}>
              Back to the shelf
            </button>
          </div>
        </div>
      ) : (
        <div className="pr-stage">
          <p className="rr-sr-only" aria-live="polite" aria-atomic="true">
            Generating — {view.label}
          </p>
          <p className="pr-eyebrow">On the press</p>
          <h2 className="pr-beat">{view.label}</h2>
          <div className="pr-rule">
            <div
              className="pr-track"
              role="progressbar"
              aria-label="Story generation progress"
              aria-valuenow={view.pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="pr-fill" style={{ width: `${view.pct}%` }} />
            </div>
            {view.phase === 'illustrating' && view.total != null && (
              <p className="pr-count">Plate {view.page} of {view.total}</p>
            )}
          </div>
          {view.phase === 'illustrating' && view.total != null && (
            <div className="pr-bed" aria-hidden="true">
              {Array.from({ length: view.total }).map((_, i) => {
                const done = i < (view.page ?? 0);
                const active = i === (view.page ?? 0);
                return (
                  <span key={i} className={`pr-plate${done ? ' is-done' : active ? ' is-active' : ''}`} />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
