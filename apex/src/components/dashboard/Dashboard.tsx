import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { StoryRecord } from '../../types/story.types';
import { CatalogService, CreateStoryInput } from '../../services/CatalogService';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Masthead } from './Masthead';
import { MatchupComposer } from './MatchupComposer';
import { StoryCard, matchupTitle } from './StoryCard';
import { PressRoom } from './PressRoom';
import './Dashboard.css';

type SortOrder = 'newest' | 'oldest' | 'az';

export const Dashboard: React.FC<{ onReadStory: (id: string) => void }> = ({ onReadStory }) => {
  const { user, signOut } = useAuth();
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [revealedWinners, setRevealedWinners] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [composerOpen, setComposerOpen] = useState(false);
  const [watchingId, setWatchingId] = useState<string | null>(null);

  const toggleWinnerReveal = useCallback((id: string) => {
    setRevealedWinners((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Reconcile a Realtime postgres_changes payload into local state.
  const onChange = useCallback(
    (payload: import('@supabase/supabase-js').RealtimePostgresChangesPayload<StoryRecord>) => {
      setStories((prev) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const row = payload.new as StoryRecord;
          if (prev.some((s) => s.id === row.id)) {
            return prev.map((s) => (s.id === row.id ? row : s));
          }
          return [row, ...prev];
        }
        if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as Partial<StoryRecord>).id;
          return prev.filter((s) => s.id !== oldId);
        }
        return prev;
      });
    },
    [],
  );

  const loadStories = useCallback(async () => {
    const data = await CatalogService.listStories();
    setStories(data);
  }, []);

  // Initial load + owner-filtered Realtime subscription.
  useEffect(() => {
    if (!user) return;
    loadStories();
    const channel = CatalogService.subscribeToStories(user.id, onChange);
    return () => {
      supabase.removeChannel(channel);
    };
    // user?.id is the stable identity key for (re)subscribing; the user object
    // itself is intentionally not a dependency to avoid needless resubscribes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, onChange, loadStories]);

  // Batch-resolve signed cover URLs for ready rows with a cover path.
  const readyCoverPaths = useMemo(
    () =>
      stories
        .filter((s) => s.status === 'ready' && s.cover_image_path)
        .map((s) => s.cover_image_path as string),
    [stories],
  );

  useEffect(() => {
    if (readyCoverPaths.length === 0) return;
    let cancelled = false;
    CatalogService.resolveSignedUrls(readyCoverPaths).then((map) => {
      if (!cancelled) setCoverUrls((prev) => ({ ...prev, ...map }));
    });
    return () => {
      cancelled = true;
    };
    // readyCoverPaths is a fresh array on every render; join() gives a stable
    // string dep that only changes when the set of paths actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyCoverPaths.join(',')]);

  // Non-blocking submit; the new generating row arrives via Realtime. Closing
  // the overlay is the caller's concern (see the overlay instance below), so
  // this stays variant-agnostic and is reused by the inline empty-state form.
  const handleCreate = useCallback(async (input: CreateStoryInput) => {
    await CatalogService.createStory(input);
  }, []);

  // Optimistic delete with reload-on-failure.
  const handleDelete = useCallback(
    async (id: string) => {
      setStories((prev) => prev.filter((s) => s.id !== id));
      try {
        await CatalogService.deleteStory(id);
      } catch (error) {
        console.error('[Dashboard] Delete failed:', error);
        await loadStories();
      }
    },
    [loadStories],
  );

  // Optimistic retry: flip the row back to generating, then re-enqueue.
  const handleRetry = useCallback(
    async (id: string) => {
      setStories((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: 'generating', error: null, progress: { phase: 'queued' } } : s,
        ),
      );
      try {
        await CatalogService.retryStory(id);
      } catch (error) {
        console.error('[Dashboard] Retry failed:', error);
        await loadStories();
      }
    },
    [loadStories],
  );

  // If the library empties (for example a Realtime DELETE of the last story)
  // while the composer overlay is open, close it so it cannot reopen later.
  useEffect(() => {
    if (stories.length === 0) setComposerOpen(false);
  }, [stories.length]);

  const visibleStories = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = stories;
    if (q) {
      list = list.filter(
        (s) =>
          s.animal_a.toLowerCase().includes(q) ||
          s.animal_b.toLowerCase().includes(q) ||
          (s.title ?? '').toLowerCase().includes(q),
      );
    }
    const sorted = [...list];
    if (sort === 'newest') {
      sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else if (sort === 'oldest') {
      sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    } else {
      sorted.sort((a, b) => matchupTitle(a).localeCompare(matchupTitle(b)));
    }
    return sorted;
  }, [stories, search, sort]);

  const isEmpty = stories.length === 0;

  return (
    <div className="rr">
      <Masthead
        email={user?.email ?? null}
        showCompose={!isEmpty}
        onCompose={() => setComposerOpen(true)}
        onSignOut={signOut}
      />

      {isEmpty ? (
        <section className="rr-empty">
          <p className="rr-empty-welcome">Conjure your first matchup.</p>
          <MatchupComposer variant="inline" onCreate={handleCreate} />
        </section>
      ) : (
        <>
          <div className="rr-browse">
            <h2 className="rr-shelf-title">
              Your Library <span>{stories.length} {stories.length === 1 ? 'book' : 'books'}</span>
            </h2>
            <div className="rr-browse-controls">
              <div className="rr-search">
                <Search size={15} aria-hidden="true" />
                <label className="rr-sr-only" htmlFor="rr-search-input">
                  Search by name
                </label>
                <input
                  id="rr-search-input"
                  type="search"
                  placeholder="Search by name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <label className="rr-sr-only" htmlFor="rr-sort">
                Sort
              </label>
              <select
                id="rr-sort"
                className="rr-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOrder)}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="az">A to Z</option>
              </select>
            </div>
          </div>

          {visibleStories.length === 0 ? (
            <p className="rr-no-results">No matchups match that search.</p>
          ) : (
            <div className="rr-gallery">
              {visibleStories.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  coverUrl={story.cover_image_path ? coverUrls[story.cover_image_path] : undefined}
                  isWinnerRevealed={revealedWinners.has(story.id)}
                  onToggleWinner={toggleWinnerReveal}
                  onReadStory={onReadStory}
                  onDelete={handleDelete}
                  onWatch={(id) => setWatchingId(id)}
                  onRetry={handleRetry}
                />
              ))}
            </div>
          )}

          {composerOpen && (
            <MatchupComposer
              variant="overlay"
              onCreate={async (input) => {
                await handleCreate(input);
                setComposerOpen(false);
              }}
              onClose={() => setComposerOpen(false)}
            />
          )}

          {watchingId && (() => {
            const watched = stories.find((s) => s.id === watchingId);
            if (!watched) return null;
            return createPortal(
              <PressRoom
                story={watched}
                coverUrl={watched.cover_image_path ? coverUrls[watched.cover_image_path] : undefined}
                onReadStory={onReadStory}
                onRetry={handleRetry}
                onDelete={(id) => {
                  handleDelete(id);
                  setWatchingId(null);
                }}
                onClose={() => setWatchingId(null)}
              />,
              document.body,
            );
          })()}
        </>
      )}
    </div>
  );
};
