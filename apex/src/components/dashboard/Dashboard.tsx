import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { BookOpen, Search, Sparkles, Trash2, Trophy, Loader, Eye } from 'lucide-react';
import { IStoryManifestLite } from '../../types/story.types';
import { ART_STYLE_OPTIONS, ArtStyleId } from '../../types/artStyle';
import { StorageService } from '../../services/StorageService';
import { StoryGeneratorService } from '../../services/StoryGeneratorService';
import { useAiConfig } from '../../contexts/AiConfigContext';

// #14: Static generation messages moved to module scope
const GENERATION_MESSAGES = [
    { emoji: '\u{1F52C}', text: 'Researching animal profiles...' },
    { emoji: '\u{1F4CA}', text: 'Analyzing biological stats...' },
    { emoji: '\u{1F9E0}', text: 'Comparing intelligence levels...' },
    { emoji: '\u2694\uFE0F', text: 'Simulating the showdown...' },
    { emoji: '\u{1F3A8}', text: 'Illustrating the pages...' },
    { emoji: '\u{1F5BC}\uFE0F', text: 'Generating cover art...' },
    { emoji: '\u270D\uFE0F', text: 'Writing the narrative...' },
    { emoji: '\u{1F4D6}', text: 'Binding the book...' },
] as const;

// Example animal list for simple auto-complete/search proxy
const commonAnimals = ['Lion', 'Tiger', 'Polar Bear', 'Grizzly Bear', 'Great White Shark', 'Killer Whale', 'Komodo Dragon', 'King Cobra', 'Hippopotamus', 'Rhinoceros', 'Tarantula', 'Scorpion', 'T-Rex', 'Velociraptor'];

const IMAGE_MODELS: Record<string, { value: string; label: string }[]> = {
    gemini: [
        { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash' },
        { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash' },
    ],
    openai: [
        { value: 'gpt-image-2', label: 'GPT Image 2' },
        { value: 'gpt-image-1', label: 'GPT Image 1' },
        { value: 'dall-e-3', label: 'DALL-E 3' },
    ],
};

// #6: Memoized StoryCard component
const StoryCard = React.memo<{
    story: IStoryManifestLite;
    isWinnerRevealed: boolean;
    onToggleWinner: (id: string) => void;
    onReadStory: (id: string) => void;
    onDelete: (id: string) => void;
}>(({ story, isWinnerRevealed, onToggleWinner, onReadStory, onDelete }) => (
    <div className="story-card">
        <div className="story-card-inner">
            <div className="custom-cover">
                {story.coverImageUrl ? (
                    <img
                        src={story.coverImageUrl}
                        alt={`${story.animalA.commonName} vs ${story.animalB.commonName}`}
                        className="cover-image"
                        loading="lazy"
                        decoding="async"
                    />
                ) : null}
                <div className="cover-overlay">
                    <h3>{story.animalA.commonName}</h3>
                    <span className="cover-vs">VS</span>
                    <h3>{story.animalB.commonName}</h3>
                </div>
            </div>
            <div className="story-info">
                <h4>{story.metadata.title}</h4>
                <p className="date">{new Date(story.metadata.createdAt).toLocaleDateString()}</p>

                {isWinnerRevealed ? (
                    <button
                        className="winner-badge"
                        onClick={(e) => { e.stopPropagation(); onToggleWinner(story.metadata.id); }}
                    >
                        <Trophy size={14} /> Winner: {story.outcome.winnerId === 'none' ? 'None (Surprise!)' : (story.outcome.winnerId === 'animalA' ? story.animalA.commonName : story.animalB.commonName)}
                    </button>
                ) : (
                    <button
                        className="reveal-winner-btn"
                        onClick={(e) => { e.stopPropagation(); onToggleWinner(story.metadata.id); }}
                    >
                        <Eye size={14} /> Reveal Winner
                    </button>
                )}
            </div>
            <div className="card-actions">
                <button onClick={() => onReadStory(story.metadata.id)} className="read-btn">
                    <BookOpen size={16} /> Read Full Book
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(story.metadata.id); }}
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
    const [stories, setStories] = useState<IStoryManifestLite[]>([]);
    const [animalA, setAnimalA] = useState('');
    const [animalB, setAnimalB] = useState('');
    const [artStyle, setArtStyle] = useState<ArtStyleId>('surprise');
    const [fierceMode, setFierceMode] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationStep, setGenerationStep] = useState(0);
    const [revealedWinners, setRevealedWinners] = useState<Set<string>>(new Set());
    const { config, setConfig, availableProviders } = useAiConfig();

    // #7: Progress state
    const [progressStep, setProgressStep] = useState('');
    const [progressPct, setProgressPct] = useState(0);

    // #6: Memoized callbacks
    const toggleWinnerReveal = useCallback((id: string) => {
        setRevealedWinners(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // #14: Empty dependency array since GENERATION_MESSAGES is at module scope
    const cycleGenerationStep = useCallback(() => {
        setGenerationStep(prev => (prev + 1) % GENERATION_MESSAGES.length);
    }, []);

    useEffect(() => {
        if (!isGenerating) {
            setGenerationStep(0);
            return;
        }
        const interval = setInterval(cycleGenerationStep, 3500);
        return () => clearInterval(interval);
    }, [isGenerating, cycleGenerationStep]);

    const loadStories = async () => {
        const data = await StorageService.getAllManifests();
        setStories(data);
    };

    useEffect(() => {
        loadStories();
    }, []);

    // #6: Memoized handleGenerate
    const handleGenerate = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!animalA.trim() || !animalB.trim()) return;

        setIsGenerating(true);
        setProgressStep('');
        setProgressPct(0);
        try {
            // #7: Pass progress callback
            const newStory = await StoryGeneratorService.generateStory(
                config, animalA.trim(), animalB.trim(),
                { artStyle, fierceMode },
                (step, pct) => { setProgressStep(step); setProgressPct(pct); }
            );
            await StorageService.saveStory(newStory);
            setAnimalA('');
            setAnimalB('');
            setArtStyle('surprise');
            setFierceMode(false);
            // #13: Optimistic story append instead of re-reading all from IndexedDB
            setStories(prev => [newStory, ...prev]);
        } catch (error) {
            console.error(error);
            alert('Failed to generate story.');
        } finally {
            setIsGenerating(false);
        }
    }, [animalA, animalB, artStyle, fierceMode, config]);

    // #6: Memoized handleDelete
    const handleDelete = useCallback(async (id: string) => {
        console.log('[Dashboard] Deleting story:', id);
        // Optimistically remove from UI immediately
        setStories(prev => prev.filter(s => s.metadata.id !== id));
        try {
            await StorageService.deleteStory(id);
            console.log('[Dashboard] Story deleted successfully');
        } catch (error) {
            console.error('[Dashboard] Delete failed:', error);
            // Reload to restore if delete failed
            await loadStories();
        }
    }, []);

    // #6: Memoized stories list
    const sortedStories = useMemo(() => stories, [stories]);

    // Determine display message and percentage for overlay
    const displayStep = progressStep || GENERATION_MESSAGES[generationStep].text;
    const displayEmoji = progressStep
        ? (GENERATION_MESSAGES.find(m => progressStep.includes(m.text.replace('...', '')))?.emoji ?? '\u2699\uFE0F')
        : GENERATION_MESSAGES[generationStep].emoji;
    const displayPct = progressPct;

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
                            disabled={isGenerating}
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
                            disabled={isGenerating}
                            required
                        />
                    </div>
                    <button type="submit" disabled={isGenerating || !animalA || !animalB} className="generate-btn">
                        {isGenerating ? 'Generating Simulation...' : <span><Sparkles size={18} /> Generate Story</span>}
                    </button>
                    <div className="art-style-picker">
                        <label htmlFor="art-style">Art Style:</label>
                        <select
                            id="art-style"
                            value={artStyle}
                            onChange={(e) => setArtStyle(e.target.value as ArtStyleId)}
                            disabled={isGenerating}
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
                        <div className="provider-selector fierce-mode-toggle">
                            <label htmlFor="fierce-mode">
                                <input
                                    id="fierce-mode"
                                    type="checkbox"
                                    checked={fierceMode}
                                    onChange={(e) => setFierceMode(e.target.checked)}
                                    disabled={isGenerating}
                                />
                                {' '}Fierce Mode
                            </label>
                        </div>
                        {availableProviders.llm.length > 1 && (
                            <div className="provider-selector">
                                <label htmlFor="llm-provider">LLM Provider:</label>
                                <select
                                    id="llm-provider"
                                    value={config.llmProvider}
                                    onChange={(e) => setConfig({ ...config, llmProvider: e.target.value })}
                                    disabled={isGenerating}
                                >
                                    {availableProviders.llm.map((p) => (
                                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {availableProviders.image.length > 1 && (
                            <div className="provider-selector">
                                <label htmlFor="image-provider">Image Provider:</label>
                                <select
                                    id="image-provider"
                                    value={config.imageProvider}
                                    onChange={(e) => setConfig({ ...config, imageProvider: e.target.value, imageModel: undefined })}
                                    disabled={isGenerating}
                                >
                                    {availableProviders.image.map((p) => (
                                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {IMAGE_MODELS[config.imageProvider] && (
                            <div className="provider-selector">
                                <label htmlFor="image-model">Image Model:</label>
                                <select
                                    id="image-model"
                                    value={config.imageModel ?? IMAGE_MODELS[config.imageProvider]?.[0]?.value ?? ''}
                                    onChange={(e) => setConfig({ ...config, imageModel: e.target.value })}
                                    disabled={isGenerating}
                                >
                                    {IMAGE_MODELS[config.imageProvider].map((m) => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                </details>
                <datalist id="animals">
                    {commonAnimals.map(a => <option key={a} value={a} />)}
                </datalist>
            </div>

            {isGenerating && (
                <div className="generation-overlay">
                    <div className="generation-modal">
                        <div className="generation-spinner">
                            <Loader className="spin-icon" size={48} />
                        </div>
                        <h3 className="generation-title">Creating Your Book</h3>
                        <p className="generation-versus">
                            {animalA || '???'} <span>vs</span> {animalB || '???'}
                        </p>
                        <div className="generation-status">
                            <span className="generation-emoji">{displayEmoji}</span>
                            <span className="generation-message">{displayStep}</span>
                        </div>
                        {/* #7: Real progress bar tied to progressPct */}
                        <div className="generation-progress-track">
                            <div
                                className="generation-progress-bar"
                                style={{ width: `${displayPct}%` }}
                                role="progressbar"
                                aria-valuenow={displayPct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                            />
                        </div>
                        <p className="generation-hint">This may take a minute — we're generating AI illustrations for every page!</p>
                    </div>
                </div>
            )}

            <div className="stories-section">
                <h2>Your Library ({sortedStories.length})</h2>
                {sortedStories.length === 0 ? (
                    <div className="empty-state">
                        <BookOpen size={48} className="empty-icon" />
                        <p>Your library is empty. Generate a story to begin the ultimate showdown!</p>
                    </div>
                ) : (
                    <div className="story-grid">
                        {sortedStories.map(story => (
                            <StoryCard
                                key={story.metadata.id}
                                story={story}
                                isWinnerRevealed={revealedWinners.has(story.metadata.id)}
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
