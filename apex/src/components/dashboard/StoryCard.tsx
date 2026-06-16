import React from 'react';
import { BookOpen, Trophy, Eye, AlertTriangle, Trash2 } from 'lucide-react';
import { StoryRecord } from '../../types/story.types';

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
}

export const StoryCard = React.memo<StoryCardProps>(function StoryCard({
  story,
  coverUrl,
  isWinnerRevealed,
  onToggleWinner,
  onReadStory,
  onDelete,
}) {
  const titleText = story.title ?? `${story.animal_a} vs ${story.animal_b}`;

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

        {story.status === 'generating' && (
          <div className="rr-press">
            <span className="rr-press-amp" aria-hidden="true">&amp;</span>
            <span className="rr-sweep" aria-hidden="true" />
            <div className="rr-progress">
              <div className="rr-ptrack">
                <div
                  className="rr-pbar"
                  style={{ width: `${story.progress_pct}%` }}
                  role="progressbar"
                  aria-valuenow={story.progress_pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <p className="rr-pstep">{story.progress_step ?? 'Working...'}</p>
            </div>
            <span className="rr-press-cap">On the press</span>
          </div>
        )}

        {story.status === 'failed' && (
          <div className="rr-failed" aria-hidden="true">
            <span className="rr-fail-mark">!</span>
          </div>
        )}
      </div>

      <div className="rr-meta">
        <h3 className="rr-title">{titleText}</h3>
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
            <button
              type="button"
              className="rr-remove-text"
              aria-label="Remove story"
              onClick={() => onDelete(story.id)}
            >
              Remove
            </button>
          </>
        )}
      </div>
    </article>
  );
});
