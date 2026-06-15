import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { BookOpen, Search, Sparkles, Trash2, Trophy, Eye, AlertTriangle } from 'lucide-react';
import { StoryRecord } from '../../types/story.types';
import { ART_STYLE_OPTIONS, ArtStyleId } from '../../types/artStyle';
import { CatalogService } from '../../services/CatalogService';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

// Example animal list for simple auto-complete/search proxy
const commonAnimals = ['Lion', 'Tiger', 'Polar Bear', 'Grizzly Bear', 'Great White Shark', 'Killer Whale', 'Komodo Dragon', 'King Cobra', 'Hippopotamus', 'Rhinoceros', 'Tarantula', 'Scorpion', 'T-Rex', 'Velociraptor'];

/** Resolves the human-readable winner label from a ready story's manifest. */
function winnerLabel(story: StoryRecord): string {
    const outcome = story.manifest?.outcome;
    if (!outcome) return 'Unknown';
    if (outcome.winnerId === 'none') return 'None (Surprise!)';
    if (outcome.winnerId === 'animalA') {
        return story.manifest?.animalA.commonName ?? story.animal_a;
    }
    return story.manifest?.animalB.commonName ?? story.animal_b;
}

// #6: Memoized StoryCard component — renders one of three status-aware layouts.
const StoryCard = React.memo<{
    story: StoryRecord;
    coverUrl?: string;
    isWinnerRevealed: boolean;
    onToggleWinner: (id: string) => void;
    onReadStory: (id: string) => void;
    onDelete: (id: string) => void;
}>(({ story, coverUrl, isWinnerRevealed, onToggleWinner, onReadStory, onDelete }) => (
    <div className="story-card">
        <div className="story-card-inner">
            <div className="custom-cover">
                {story.status === 'ready' && coverUrl ? (
                    <img
                        src={coverUrl}
                        alt={`${story.animal_a} vs ${story.animal_b}`}
                        className="cover-image"
                        loading="lazy"
                        decoding="async"
                    />
                ) : null}
                <div className="cover-overlay">
                    <h3>{story.animal_a}</h3>
                    <span className="cover-vs">VS</span>
                    <h3>{story.animal_b}</h3>
                </div>
            </div>
            <div className="story-info">
                <h4>{story.title ?? `${story.animal_a} vs ${story.animal_b}`}</h4>
                <p className="date">{new Date(story.created_at).toLocaleDateString()}</p>

                {story.status === 'generating' && (
                    <div className="story-progress">
                        <div className="story-progress-track">
                            <div
                                className="story-progress-bar"
                                style={{ width: `${story.progress_pct}%` }}
                                role="progressbar"
                                aria-valuenow={story.progress_pct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                            />
                        </div>
                        <p className="story-progress-step">{story.progress_step ?? 'Working…'}</p>
                    </div>
                )}

                {story.status === 'ready' && (
                    isWinnerRevealed ? (
                        <button
                            className="winner-badge"
                            onClick={(e) => { e.stopPropagation(); onToggleWinner(story.id); }}
                        >
                            <Trophy size={14} /> Winner: {winnerLabel(story)}
                        </button>
                    ) : (
                        <button
                            className="reveal-winner-btn"
                            onClick={(e) => { e.stopPropagation(); onToggleWinner(story.id); }}
                        >
                            <Eye size={14} /> Reveal Winner
                        </button>
                    )
                )}

                {story.status === 'failed' && (
                    <div className="story-error" role="alert">
                        <AlertTriangle size={14} /> Generation failed: {story.error ?? 'Unknown error'}
                    </div>
                )}
            </div>
            <div className="card-actions">
                {story.status === 'ready' && (
                    <button onClick={() => onReadStory(story.id)} className="read-btn">
                        <BookOpen size={16} /> Read Full Book
                    </button>
                )}
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(story.id); }}
                    className="delete-btn"
                    aria-label="Delete Story"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    </div>
));
StoryCard.displayName = 'StoryCard';

export const Dashboard: React.FC<{ onReadStory: (id: string) => void }> = ({ onReadStory }) => {
    const { user } = useAuth();
    const [stories, setStories] = useState<StoryRecord[]>([]);
    const [animalA, setAnimalA] = useState('');
    const [animalB, setAnimalB] = useState('');
    const [artStyle, setArtStyle] = useState<ArtStyleId>('surprise');
    const [fierceMode, setFierceMode] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [revealedWinners, setRevealedWinners] = useState<Set<string>>(new Set());
    // Resolved signed URLs for ready-story cover thumbnails, keyed by Storage path.
    const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});

    // #6: Memoized callbacks
    const toggleWinnerReveal = useCallback((id: string) => {
        setRevealedWinners(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Reconcile a Realtime postgres_changes payload into local state.
    const onChange = useCallback((payload: import('@supabase/supabase-js').RealtimePostgresChangesPayload<StoryRecord>) => {
        setStories(prev => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                const row = payload.new as StoryRecord;
                if (prev.some(s => s.id === row.id)) {
                    return prev.map(s => (s.id === row.id ? row : s));
                }
                return [row, ...prev];
            }
            if (payload.eventType === 'DELETE') {
                const oldId = (payload.old as Partial<StoryRecord>).id;
                return prev.filter(s => s.id !== oldId);
            }
            return prev;
        });
    }, []);

    const loadStories = useCallback(async () => {
        const data = await CatalogService.listStories();
        setStories(data);
    }, []);

    // Initial load + owner-filtered Realtime subscription.
    useEffect(() => {
        loadStories();
        if (!user) return;
        const channel = CatalogService.subscribeToStories(user.id, onChange);
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, onChange, loadStories]);

    // Batch-resolve signed cover URLs for ready rows with a cover path.
    const readyCoverPaths = useMemo(
        () => stories
            .filter(s => s.status === 'ready' && s.cover_image_path)
            .map(s => s.cover_image_path as string),
        [stories],
    );

    useEffect(() => {
        if (readyCoverPaths.length === 0) return;
        let cancelled = false;
        CatalogService.resolveSignedUrls(readyCoverPaths).then(map => {
            if (!cancelled) setCoverUrls(prev => ({ ...prev, ...map }));
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readyCoverPaths.join(',')]);

    // #6: Non-blocking submit — the new generating row arrives via Realtime.
    const handleGenerate = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!animalA.trim() || !animalB.trim()) return;

        setSubmitting(true);
        try {
            await CatalogService.createStory({
                animalA: animalA.trim(),
                animalB: animalB.trim(),
                artStyle,
                fierceMode,
            });
            // Clear the form immediately; the library stays interactive.
            setAnimalA('');
            setAnimalB('');
            setArtStyle('surprise');
            setFierceMode(false);
        } catch (error) {
            console.error(error);
            alert('Failed to start generation.');
        } finally {
            setSubmitting(false);
        }
    }, [animalA, animalB, artStyle, fierceMode]);

    // #6: Memoized handleDelete with optimistic removal.
    const handleDelete = useCallback(async (id: string) => {
        setStories(prev => prev.filter(s => s.id !== id));
        try {
            await CatalogService.deleteStory(id);
        } catch (error) {
            console.error('[Dashboard] Delete failed:', error);
            // Reload to restore if delete failed.
            await loadStories();
        }
    }, [loadStories]);

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <h1>Apex Predator <span>Confrontation</span></h1>
                <p>A Generative Educational Narrative Engine</p>
            </header>

            <div className="generator-section">
                <h2>Create a New Story</h2>
                <form onSubmit={handleGenerate} className="generator-form">
                    <div className="input-group">
                        <Search className="input-icon" size={20} />
                        <input
                            type="text"
                            placeholder="Animal A (e.g., Lion)"
                            value={animalA}
                            onChange={(e) => setAnimalA(e.target.value)}
                            list="animals"
                            required
                        />
                    </div>
                    <span className="vs-badge">VS</span>
                    <div className="input-group">
                        <Search className="input-icon" size={20} />
                        <input
                            type="text"
                            placeholder="Animal B (e.g., Tiger)"
                            value={animalB}
                            onChange={(e) => setAnimalB(e.target.value)}
                            list="animals"
                            required
                        />
                    </div>
                    <button type="submit" disabled={submitting || !animalA || !animalB} className="generate-btn">
                        {submitting ? 'Starting…' : <span><Sparkles size={18} /> Generate Story</span>}
                    </button>
                    <div className="art-style-picker">
                        <label htmlFor="art-style">Art Style:</label>
                        <select
                            id="art-style"
                            value={artStyle}
                            onChange={(e) => setArtStyle(e.target.value as ArtStyleId)}
                        >
                            {ART_STYLE_OPTIONS.map((o) => (
                                <option key={o.id} value={o.id}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                </form>
                <details className="advanced-options">
                    <summary>Advanced Options</summary>
                    <div className="advanced-options-content">
                        <div className="fierce-mode-toggle">
                            <label htmlFor="fierce-mode">
                                <input
                                    id="fierce-mode"
                                    type="checkbox"
                                    checked={fierceMode}
                                    onChange={(e) => setFierceMode(e.target.checked)}
                                />
                                {' '}Fierce Mode
                            </label>
                        </div>
                    </div>
                </details>
                <datalist id="animals">
                    {commonAnimals.map(a => <option key={a} value={a} />)}
                </datalist>
            </div>

            <div className="stories-section">
                <h2>Your Library ({stories.length})</h2>
                {stories.length === 0 ? (
                    <div className="empty-state">
                        <BookOpen size={48} className="empty-icon" />
                        <p>Your library is empty. Generate a story to begin the ultimate showdown!</p>
                    </div>
                ) : (
                    <div className="story-grid">
                        {stories.map(story => (
                            <StoryCard
                                key={story.id}
                                story={story}
                                coverUrl={story.cover_image_path ? coverUrls[story.cover_image_path] : undefined}
                                isWinnerRevealed={revealedWinners.has(story.id)}
                                onToggleWinner={toggleWinnerReveal}
                                onReadStory={onReadStory}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
