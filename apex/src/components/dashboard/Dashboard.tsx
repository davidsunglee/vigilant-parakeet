import React, { useEffect, useState, useCallback } from 'react';
import { BookOpen, Search, Sparkles, Trash2, Trophy, Loader, Eye } from 'lucide-react';
import { IStoryManifest } from '../../types/story.types';
import { StorageService } from '../../services/StorageService';
import { StoryGeneratorService } from '../../services/StoryGeneratorService';
import { useAiConfig } from '../../contexts/AiConfigContext';

export const Dashboard: React.FC<{ onReadStory: (id: string) => void }> = ({ onReadStory }) => {
    const [stories, setStories] = useState<IStoryManifest[]>([]);
    const [animalA, setAnimalA] = useState('');
    const [animalB, setAnimalB] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationStep, setGenerationStep] = useState(0);
    const [revealedWinners, setRevealedWinners] = useState<Set<string>>(new Set());
    const { config, setConfig, availableProviders } = useAiConfig();

    const toggleWinnerReveal = (id: string) => {
        setRevealedWinners(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const generationMessages = [
        { emoji: '🔬', text: 'Researching animal profiles...' },
        { emoji: '📊', text: 'Analyzing biological stats...' },
        { emoji: '🧠', text: 'Comparing intelligence levels...' },
        { emoji: '⚔️', text: 'Simulating the showdown...' },
        { emoji: '🎨', text: 'Illustrating the pages...' },
        { emoji: '🖼️', text: 'Generating cover art...' },
        { emoji: '✍️', text: 'Writing the narrative...' },
        { emoji: '📖', text: 'Binding the book...' },
    ];

    const cycleGenerationStep = useCallback(() => {
        setGenerationStep(prev => (prev + 1) % generationMessages.length);
    }, [generationMessages.length]);

    useEffect(() => {
        if (!isGenerating) {
            setGenerationStep(0);
            return;
        }
        const interval = setInterval(cycleGenerationStep, 3500);
        return () => clearInterval(interval);
    }, [isGenerating, cycleGenerationStep]);

    // Example animal list for simple auto-complete/search proxy
    const commonAnimals = ['Lion', 'Tiger', 'Polar Bear', 'Grizzly Bear', 'Great White Shark', 'Killer Whale', 'Komodo Dragon', 'King Cobra', 'Hippopotamus', 'Rhinoceros', 'Tarantula', 'Scorpion', 'T-Rex', 'Velociraptor'];

    const loadStories = async () => {
        const data = await StorageService.getAllStories();
        setStories(data);
    };

    useEffect(() => {
        loadStories();
    }, []);

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!animalA.trim() || !animalB.trim()) return;

        setIsGenerating(true);
        try {
            const newStory = await StoryGeneratorService.generateStory(config, animalA.trim(), animalB.trim());
            await StorageService.saveStory(newStory);
            setAnimalA('');
            setAnimalB('');
            await loadStories();
        } catch (error) {
            console.error(error);
            alert('Failed to generate story.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDelete = async (id: string) => {
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
    };

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
                </form>
                <details className="advanced-options">
                    <summary>Advanced Options</summary>
                    <div className="advanced-options-content">
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
                        <div className="provider-selector">
                            <label htmlFor="image-model">Image Model:</label>
                            <select
                                id="image-model"
                                value={config.imageModel ?? 'gemini-3.1-flash-image-preview'}
                                onChange={(e) => setConfig({ ...config, imageModel: e.target.value })}
                                disabled={isGenerating}
                            >
                                <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash</option>
                                <option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option>
                            </select>
                        </div>
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
                            <span className="generation-emoji">{generationMessages[generationStep].emoji}</span>
                            <span className="generation-message">{generationMessages[generationStep].text}</span>
                        </div>
                        <div className="generation-progress-track">
                            <div className="generation-progress-bar" />
                        </div>
                        <p className="generation-hint">This may take a minute — we're generating AI illustrations for every page!</p>
                    </div>
                </div>
            )}

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
                            <div key={story.metadata.id} className="story-card">
                                <div className="story-card-inner">
                                    <div className="custom-cover">
                                        {story.coverImageUrl ? (
                                            <img src={story.coverImageUrl} alt={`${story.animalA.commonName} vs ${story.animalB.commonName}`} className="cover-image" />
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

                                        {revealedWinners.has(story.metadata.id) ? (
                                            <button
                                                className="winner-badge"
                                                onClick={(e) => { e.stopPropagation(); toggleWinnerReveal(story.metadata.id); }}
                                            >
                                                <Trophy size={14} /> Winner: {story.outcome.winnerId === 'none' ? 'None (Surprise!)' : (story.outcome.winnerId === 'animalA' ? story.animalA.commonName : story.animalB.commonName)}
                                            </button>
                                        ) : (
                                            <button
                                                className="reveal-winner-btn"
                                                onClick={(e) => { e.stopPropagation(); toggleWinnerReveal(story.metadata.id); }}
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
                                            onClick={(e) => { e.stopPropagation(); handleDelete(story.metadata.id); }}
                                            className="delete-btn"
                                            aria-label="Delete Story"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
