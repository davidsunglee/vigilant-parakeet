import React from 'react';
import { BookOpen, Trophy, Eye, AlertTriangle, Trash2 } from 'lucide-react';
import { StoryRecord } from '../../types/story.types';
import { describeProgress } from './describeProgress';

/** Title-cases each whitespace-separated word ("thresher shark" -> "Thresher Shark"). */
function toTitleCase(value: string): string {
  return value.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/**
 * Title-cased contender names for a matchup. Prefers the manifest's normalized
 * common names (matching the reader header), falling back to the raw contender
 * fields while a story is still generating. Title-casing keeps every card's
 * formatting uniform regardless of how the source was capitalized.
 */
export function matchupNames(story: StoryRecord): { a: string; b: string } {
  return {
    a: toTitleCase(story.manifest?.animalA.commonName ?? story.animal_a),
    b: toTitleCase(story.manifest?.animalB.commonName ?? story.animal_b),
  };
}

/** Clean matchup label ("Giraffe & Chimpanzee") for sorting and aria labels. */
export function matchupTitle(story: StoryRecord): string {
  const { a, b } = matchupNames(story);
  return `${a} & ${b}`;
}

/** Resolves the human-readable winner label from a ready story's manifest. */
export function winnerLabel(story: StoryRecord): string {
  const outcome = story.manifest?.outcome;
  if (!outcome) return 'Unknown';
  if (outcome.winnerId === 'none') return 'None (Surprise!)';
  if (outcome.winnerId === 'animalA') {
    return story.manifest?.animalA.commonName ?? story.animal_a;
  }
  return story.manifest?.animalB.commonName ?? story.animal_b;
}

export interface StoryCardProps {
  story: StoryRecord;
  coverUrl?: string;
  isWinnerRevealed: boolean;
  onToggleWinner: (id: string) => void;
  onReadStory: (id: string) => void;
  onDelete: (id: string) => void;
  onWatch?: (id: string) => void;
  onRetry?: (id: string) => void;
}

export const StoryCard = React.memo<StoryCardProps>(function StoryCard({
  story,
  coverUrl,
  isWinnerRevealed,
  onToggleWinner,
  onReadStory,
  onDelete,
  onWatch,
  onRetry,
}) {
  const { a: nameA, b: nameB } = matchupNames(story);
  const titleText = `${nameA} & ${nameB}`;

  return (
    <article className={`rr-card rr-card--${story.status}`}>
      <div className="rr-cover">
        {story.status === 'ready' && (
          <>
            {coverUrl && (
              <img
                src={coverUrl}
                alt={`${story.animal_a} vs ${story.animal_b}`}
                className="rr-cover-img"
                loading="lazy"
                decoding="async"
              />
            )}
            <div className="rr-card-actions">
              <button type="button" className="rr-read" onClick={() => onReadStory(story.id)}>
                <BookOpen size={15} /> Read the book
              </button>
              <button
                type="button"
                className="rr-remove"
                aria-label="Remove story"
                onClick={() => onDelete(story.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </>
        )}

        {story.status === 'generating' && (() => {
          const view = describeProgress(story.status, story.progress);
          const press = (
            <div className="rr-press">
              <span className="rr-press-cap">On the press</span>
              <span className="rr-press-amp" aria-hidden="true">&amp;</span>
              <span className="rr-sweep" aria-hidden="true" />
              {onWatch && <span className="rr-watch" aria-hidden="true">Watch it print &rsaquo;</span>}
              <div className="rr-progress">
                <p className="rr-pstep">{view.label}</p>
                <div className="rr-ptrack">
                  <div
                    className="rr-pbar"
                    style={{ width: `${view.pct}%` }}
                    role="progressbar"
                    aria-label="Story generation progress"
                    aria-valuenow={view.pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                {view.phase === 'illustrating' && view.total != null && (
                  <p className="rr-pcount">{view.page} of {view.total}</p>
                )}
              </div>
            </div>
          );
          return onWatch ? (
            <button
              type="button"
              className="rr-press-open"
              onClick={() => onWatch(story.id)}
              aria-label={`Watch ${titleText} being printed`}
            >
              {press}
            </button>
          ) : (
            press
          );
        })()}

        {story.status === 'failed' && (
          <div className="rr-failed" aria-hidden="true">
            <span className="rr-fail-cap">The press jammed</span>
            <span className="rr-fail-mark">!</span>
          </div>
        )}
      </div>

      <div className="rr-meta">
        <h3 className="rr-title" aria-label={titleText}>
          <span className="rr-title-name" title={nameA}>{nameA}</span>
          <span className="rr-title-amp" aria-hidden="true">&amp;</span>
          <span className="rr-title-name" title={nameB}>{nameB}</span>
        </h3>
        <p className="rr-date">
          {story.status === 'generating'
            ? 'Just now'
            : new Date(story.created_at).toLocaleDateString()}
        </p>

        {story.status === 'ready' &&
          (isWinnerRevealed ? (
            <button type="button" className="rr-winner" onClick={() => onToggleWinner(story.id)}>
              <Trophy size={13} /> Winner: {winnerLabel(story)}
            </button>
          ) : (
            <button type="button" className="rr-reveal" onClick={() => onToggleWinner(story.id)}>
              <Eye size={13} /> Reveal winner
            </button>
          ))}

        {story.status === 'failed' && (
          <>
            <p className="rr-error" role="alert">
              <AlertTriangle size={13} /> This matchup did not come together.{' '}
              {story.error ?? 'Unknown error'}
            </p>
            <div className="rr-fail-actions">
              {onRetry && (
                <button type="button" className="rr-retry" onClick={() => onRetry(story.id)}>
                  Try again
                </button>
              )}
              <button
                type="button"
                className="rr-remove-text"
                aria-label="Remove story"
                onClick={() => onDelete(story.id)}
              >
                Remove
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
});
