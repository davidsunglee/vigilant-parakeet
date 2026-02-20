import React, { useEffect, useState } from 'react';
import { BookOpen, Search, Sparkles, Trash2, Trophy } from 'lucide-react';
import { IStoryManifest } from '../../types/story.types';
import { StorageService } from '../../services/StorageService';
import { StoryGeneratorService } from '../../services/StoryGeneratorService';

export const Dashboard: React.FC<{ onReadStory: (id: string) => void }> = ({ onReadStory }) => {
    const [stories, setStories] = useState<IStoryManifest[]>([]);
    const [animalA, setAnimalA] = useState('');
    const [animalB, setAnimalB] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

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
            const newStory = await StoryGeneratorService.generateStory(animalA.trim(), animalB.trim());
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
        if (window.confirm("Are you sure you want to permanently delete this story?")) {
            await StorageService.deleteStory(id);
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
                            <div key={story.metadata.id} className="story-card">
                                <div className="story-card-inner">
                                    <div className="custom-cover">
                                        <h3>{story.animalA.commonName}</h3>
                                        <span className="cover-vs">VS</span>
                                        <h3>{story.animalB.commonName}</h3>
                                    </div>
                                    <div className="story-info">
                                        <h4>{story.metadata.title}</h4>
                                        <p className="date">{new Date(story.metadata.createdAt).toLocaleDateString()}</p>

                                        {story.metadata.hasBeenRead && (
                                            <div className="winner-badge">
                                                <Trophy size={14} /> Winner: {story.outcome.winnerId === 'none' ? 'None (Surprise!)' : (story.outcome.winnerId === 'animalA' ? story.animalA.commonName : story.animalB.commonName)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="card-actions">
                                        <button onClick={() => onReadStory(story.metadata.id)} className="read-btn">
                                            <BookOpen size={16} /> Read Full Book
                                        </button>
                                        <button onClick={() => handleDelete(story.metadata.id)} className="delete-btn" aria-label="Delete Story">
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
