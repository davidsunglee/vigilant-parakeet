import React, { useEffect, useState, useRef } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { ChevronLeft, ChevronRight, X, CheckCircle, Info } from 'lucide-react';
import { IStoryManifest } from '../../types/story.types';
import { StorageService } from '../../services/StorageService';
import './BookViewer.css';

export const BookViewer: React.FC<{ storyId: string; onClose: () => void }> = ({ storyId, onClose }) => {
    const [story, setStory] = useState<IStoryManifest | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookRef = useRef<any>(null);

    useEffect(() => {
        const loadStory = async () => {
            const data = await StorageService.getStory(storyId);
            if (data) {
                setStory(data);
                if (!data.metadata.hasBeenRead) {
                    await StorageService.updateStory(storyId, { metadata: { ...data.metadata, hasBeenRead: true } });
                }
            }
        };
        loadStory();
    }, [storyId]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                bookRef.current?.pageFlip()?.flipPrev();
            } else if (e.key === 'ArrowRight') {
                bookRef.current?.pageFlip()?.flipNext();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!story) return <div className="loading-book">Loading book...</div>;

    return (
        <div className="book-viewer-container">
            <div className="book-toolbar">
                <button onClick={onClose} className="close-book-btn">
                    <X size={24} /> Back to Library
                </button>
                <div className="book-title">{story.metadata.title}</div>
            </div>

            <div className="book-canvas-area">
                <button className="nav-arrow left" aria-label="Previous Page" onClick={() => bookRef.current?.pageFlip()?.flipPrev()}>
                    <ChevronLeft size={48} />
                </button>

                <div className="book-wrapper">
                    <HTMLFlipBook
                        width={550}
                        height={733}
                        size="stretch"
                        minWidth={315}
                        maxWidth={1000}
                        minHeight={420}
                        maxHeight={1333}
                        maxShadowOpacity={0.5}
                        showCover={true}
                        mobileScrollSupport={true}
                        ref={bookRef}
                        className="book-component"
                        usePortrait={true}
                    >
                        {/* Front Cover */}
                        <div className="page page-cover">
                            {story.coverImageUrl && (
                                <img src={story.coverImageUrl} alt="Cover" className="book-cover-image" />
                            )}
                            <div className="book-cover-overlay" />
                            <div className="page-content">
                                <h2>Who Would Win?</h2>
                                <div className="cover-combatants">
                                    <h3>{story.animalA.commonName}</h3>
                                    <span>vs</span>
                                    <h3>{story.animalB.commonName}</h3>
                                </div>
                            </div>
                        </div>

                        {/* Pages 1-32 */}
                        {story.pages.map((page) => (
                            <div key={page.index} className={`page ${page.isLeftPage ? 'page-left' : 'page-right'}`}>
                                <div className="page-content">
                                    {page.title && <h3 className="page-title">{page.title}</h3>}

                                    <div className="page-media-layout">
                                        <div className="visual-content" style={{ flex: '1 1 50%', marginBottom: '20px' }}>
                                            {page.imageUrl ? (
                                                <img src={page.imageUrl} alt="Generated Illustration" className="generated-image" />
                                            ) : (
                                                <div className="placeholder-image">
                                                    <span>{page.visualPrompt}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="text-content" style={{ flex: '1 1 50%' }}>
                                            <p>{page.bodyText}</p>

                                            {/* Inject some informational text features for early pages */}
                                            {page.index <= 10 && (
                                                <div className="fun-fact-box">
                                                    <h4><Info size={16} /> Fun Fact</h4>
                                                    <p>The {page.isLeftPage ? story.animalA.commonName : story.animalB.commonName} belongs to the habitat of the {page.isLeftPage ? story.animalA.habitat : story.animalB.habitat}.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="page-number">{page.index}</div>
                                </div>
                            </div>
                        ))}

                        {/* Checklist Page */}
                        <div className="page page-checklist">
                            <div className="page-content">
                                <h3 className="page-title">Predictions Checklist</h3>
                                <p>Based on the facts, who has the advantage?</p>
                                <div className="checklist-grid">
                                    <div className="checklist-header">
                                        <span>Trait</span>
                                        <span>{story.animalA.commonName}</span>
                                        <span>{story.animalB.commonName}</span>
                                    </div>
                                    {story.checklist.items.map((item, idx) => (
                                        <div className="checklist-row" key={idx}>
                                            <span className="trait-name">{item.traitName}</span>
                                            <span className="check-box">{item.animalAAdvantage ? <CheckCircle color="var(--accent-color)" /> : ''}</span>
                                            <span className="check-box">{item.animalBAdvantage ? <CheckCircle color="var(--accent-color)" /> : ''}</span>
                                        </div>
                                    ))}
                                </div>
                                <button className="confirm-btn">Confirm Predictions</button>
                            </div>
                        </div>

                        {/* Back Cover */}
                        <div className="page page-cover page-back">
                            <div className="page-content">
                                <h2>The End</h2>
                            </div>
                        </div>
                    </HTMLFlipBook>
                </div>

                <button className="nav-arrow right" aria-label="Next Page" onClick={() => bookRef.current?.pageFlip()?.flipNext()}>
                    <ChevronRight size={48} />
                </button>
            </div>
        </div>
    );
};
