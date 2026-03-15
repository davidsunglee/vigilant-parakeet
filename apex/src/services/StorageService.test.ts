import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IStoryManifest, IStoryManifestLite, IPageContent } from '../types/story.types';

// Use vi.hoisted so the mock objects are available when vi.mock is hoisted
const { mockLegacyStore, mockManifestStore, mockPagesStore } = vi.hoisted(() => ({
    mockLegacyStore: {
        setItem: vi.fn(),
        getItem: vi.fn(),
        removeItem: vi.fn(),
        iterate: vi.fn(),
    },
    mockManifestStore: {
        setItem: vi.fn(),
        getItem: vi.fn(),
        removeItem: vi.fn(),
        iterate: vi.fn(),
    },
    mockPagesStore: {
        setItem: vi.fn(),
        getItem: vi.fn(),
        removeItem: vi.fn(),
        iterate: vi.fn(),
    },
}));

vi.mock('localforage', () => ({
    default: {
        createInstance: vi.fn((opts: { storeName: string }) => {
            if (opts.storeName === 'narrative_stories') return mockLegacyStore;
            if (opts.storeName === 'story_manifests') return mockManifestStore;
            if (opts.storeName === 'story_pages') return mockPagesStore;
            return mockLegacyStore;
        }),
        INDEXEDDB: 'asyncStorage',
    },
}));

// Import after mock is set up
import { StorageService } from './StorageService';

const mockPages: IPageContent[] = [
    {
        index: 1, title: 'Page 1', bodyText: 'Body', visualPrompt: 'prompt',
        imageUrl: 'data:image/png;base64,bigdata', isLeftPage: true,
    },
];

function makeStory(id: string, createdAt: number, overrides?: Partial<IStoryManifest>): IStoryManifest {
    return {
        metadata: { id, title: `Story ${id}`, createdAt, hasBeenRead: false },
        animalA: {
            id: 'animalA', commonName: 'Lion', scientificName: 'Panthera leo',
            habitat: 'Savannah', stats: { weight: '190 kg', length: '2.5 m', speed: '80 km/h' },
        },
        animalB: {
            id: 'animalB', commonName: 'Tiger', scientificName: 'Panthera tigris',
            habitat: 'Jungle', stats: { weight: '220 kg', length: '3.0 m', speed: '65 km/h' },
        },
        pages: mockPages,
        checklist: { items: [] },
        outcome: {
            winnerId: 'animalA', logicalReasoning: 'Faster',
            isSurpriseEnding: false, endingType: 'Standard Victory',
        },
        ...overrides,
    };
}

function toLite(story: IStoryManifest): IStoryManifestLite {
    return {
        metadata: story.metadata,
        animalA: story.animalA,
        animalB: story.animalB,
        coverImageUrl: story.coverImageUrl,
        checklist: story.checklist,
        outcome: story.outcome,
    };
}

describe('StorageService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    // ── saveStory ────────────────────────────────────────────────────

    describe('saveStory', () => {
        it('saves manifest to manifestStore and pages to pagesStore', async () => {
            const story = makeStory('uuid-1', 1000);
            mockManifestStore.setItem.mockResolvedValue(undefined);
            mockPagesStore.setItem.mockResolvedValue(undefined);

            await StorageService.saveStory(story);

            expect(mockManifestStore.setItem).toHaveBeenCalledWith('uuid-1', toLite(story));
            expect(mockPagesStore.setItem).toHaveBeenCalledWith('uuid-1', story.pages);
        });

        it('throws a user-friendly error when IndexedDB fails', async () => {
            const story = makeStory('uuid-2', 2000);
            mockManifestStore.setItem.mockRejectedValue(new Error('QuotaExceeded'));

            await expect(StorageService.saveStory(story))
                .rejects.toThrow('Failed to persist story.');
        });
    });

    // ── getStory ─────────────────────────────────────────────────────

    describe('getStory', () => {
        it('reconstructs full story from manifest and pages stores', async () => {
            const story = makeStory('uuid-3', 3000);
            mockManifestStore.getItem.mockResolvedValue(toLite(story));
            mockPagesStore.getItem.mockResolvedValue(story.pages);

            const result = await StorageService.getStory('uuid-3');

            expect(result).toEqual(story);
            expect(mockManifestStore.getItem).toHaveBeenCalledWith('uuid-3');
            expect(mockPagesStore.getItem).toHaveBeenCalledWith('uuid-3');
        });

        it('falls back to legacy store and migrates', async () => {
            const story = makeStory('uuid-legacy', 4000);
            mockManifestStore.getItem.mockResolvedValue(null);
            mockLegacyStore.getItem.mockResolvedValue(story);
            mockManifestStore.setItem.mockResolvedValue(undefined);
            mockPagesStore.setItem.mockResolvedValue(undefined);
            mockLegacyStore.removeItem.mockResolvedValue(undefined);

            const result = await StorageService.getStory('uuid-legacy');

            expect(result).toEqual(story);
            // Verify migration happened
            expect(mockManifestStore.setItem).toHaveBeenCalledWith('uuid-legacy', toLite(story));
            expect(mockPagesStore.setItem).toHaveBeenCalledWith('uuid-legacy', story.pages);
            expect(mockLegacyStore.removeItem).toHaveBeenCalledWith('uuid-legacy');
        });

        it('returns null when story is not found in any store', async () => {
            mockManifestStore.getItem.mockResolvedValue(null);
            mockLegacyStore.getItem.mockResolvedValue(null);

            const result = await StorageService.getStory('nonexistent');
            expect(result).toBeNull();
        });

        it('returns null on error', async () => {
            mockManifestStore.getItem.mockRejectedValue(new Error('DB corrupted'));

            const result = await StorageService.getStory('uuid-4');
            expect(result).toBeNull();
        });
    });

    // ── getAllManifests ───────────────────────────────────────────────

    describe('getAllManifests', () => {
        it('returns manifests sorted by createdAt descending (newest first)', async () => {
            const storyOld = makeStory('old', 1000);
            const storyMid = makeStory('mid', 2000);
            const storyNew = makeStory('new', 3000);

            mockManifestStore.iterate.mockImplementation(async (cb: (value: IStoryManifestLite) => void) => {
                cb(toLite(storyOld));
                cb(toLite(storyNew));
                cb(toLite(storyMid));
            });
            mockLegacyStore.iterate.mockImplementation(async () => {});

            const result = await StorageService.getAllManifests();

            expect(result).toHaveLength(3);
            expect(result[0].metadata.id).toBe('new');
            expect(result[1].metadata.id).toBe('mid');
            expect(result[2].metadata.id).toBe('old');
        });

        it('migrates stories from legacy store', async () => {
            const legacyStory = makeStory('legacy-1', 5000);

            mockManifestStore.iterate.mockImplementation(async () => {});
            mockLegacyStore.iterate.mockImplementation(async (cb: (value: IStoryManifest) => void) => {
                cb(legacyStory);
            });
            mockManifestStore.setItem.mockResolvedValue(undefined);
            mockPagesStore.setItem.mockResolvedValue(undefined);
            mockLegacyStore.removeItem.mockResolvedValue(undefined);

            const result = await StorageService.getAllManifests();

            expect(result).toHaveLength(1);
            expect(result[0].metadata.id).toBe('legacy-1');
            // Pages should not be in the manifest
            expect((result[0] as unknown as IStoryManifest).pages).toBeUndefined();
        });

        it('returns empty array when all stores are empty', async () => {
            mockManifestStore.iterate.mockImplementation(async () => {});
            mockLegacyStore.iterate.mockImplementation(async () => {});

            const result = await StorageService.getAllManifests();
            expect(result).toEqual([]);
        });

        it('returns empty array on error', async () => {
            mockManifestStore.iterate.mockRejectedValue(new Error('DB error'));

            const result = await StorageService.getAllManifests();
            expect(result).toEqual([]);
        });
    });

    // ── getAllStories (backward compat) ──────────────────────────────

    describe('getAllStories', () => {
        it('returns full stories with pages', async () => {
            const story = makeStory('full-1', 1000);

            mockManifestStore.iterate.mockImplementation(async (cb: (value: IStoryManifestLite) => void) => {
                cb(toLite(story));
            });
            mockLegacyStore.iterate.mockImplementation(async () => {});
            mockPagesStore.getItem.mockResolvedValue(story.pages);

            const result = await StorageService.getAllStories();

            expect(result).toHaveLength(1);
            expect(result[0].pages).toEqual(story.pages);
        });
    });

    // ── getStoryPages ────────────────────────────────────────────────

    describe('getStoryPages', () => {
        it('returns pages from pagesStore', async () => {
            mockPagesStore.getItem.mockResolvedValue(mockPages);

            const result = await StorageService.getStoryPages('uuid-pages');
            expect(result).toEqual(mockPages);
        });

        it('falls back to legacy store and migrates', async () => {
            const story = makeStory('uuid-legacy-pages', 1000);
            mockPagesStore.getItem.mockResolvedValue(null);
            mockLegacyStore.getItem.mockResolvedValue(story);
            mockManifestStore.setItem.mockResolvedValue(undefined);
            mockPagesStore.setItem.mockResolvedValue(undefined);
            mockLegacyStore.removeItem.mockResolvedValue(undefined);

            const result = await StorageService.getStoryPages('uuid-legacy-pages');
            expect(result).toEqual(story.pages);
        });

        it('returns empty array when not found', async () => {
            mockPagesStore.getItem.mockResolvedValue(null);
            mockLegacyStore.getItem.mockResolvedValue(null);

            const result = await StorageService.getStoryPages('nonexistent');
            expect(result).toEqual([]);
        });
    });

    // ── deleteStory ──────────────────────────────────────────────────

    describe('deleteStory', () => {
        it('removes the item from all stores', async () => {
            mockManifestStore.removeItem.mockResolvedValue(undefined);
            mockPagesStore.removeItem.mockResolvedValue(undefined);
            mockLegacyStore.removeItem.mockResolvedValue(undefined);

            await StorageService.deleteStory('uuid-5');

            expect(mockManifestStore.removeItem).toHaveBeenCalledWith('uuid-5');
            expect(mockPagesStore.removeItem).toHaveBeenCalledWith('uuid-5');
            expect(mockLegacyStore.removeItem).toHaveBeenCalledWith('uuid-5');
        });

        it('throws a user-friendly error on failure', async () => {
            mockManifestStore.removeItem.mockRejectedValue(new Error('DB locked'));

            await expect(StorageService.deleteStory('uuid-5'))
                .rejects.toThrow('Failed to delete story.');
        });
    });

    // ── updateStory ──────────────────────────────────────────────────

    describe('updateStory', () => {
        it('merges updates into the existing story and saves to split stores', async () => {
            const existing = makeStory('uuid-6', 5000);
            mockManifestStore.getItem.mockResolvedValue(toLite(existing));
            mockPagesStore.getItem.mockResolvedValue(existing.pages);
            mockManifestStore.setItem.mockResolvedValue(undefined);
            mockPagesStore.setItem.mockResolvedValue(undefined);

            await StorageService.updateStory('uuid-6', {
                metadata: { ...existing.metadata, hasBeenRead: true },
            });

            expect(mockManifestStore.setItem).toHaveBeenCalledWith(
                'uuid-6',
                expect.objectContaining({
                    metadata: expect.objectContaining({ hasBeenRead: true }),
                })
            );
        });

        it('throws when the story is not found', async () => {
            mockManifestStore.getItem.mockResolvedValue(null);
            mockLegacyStore.getItem.mockResolvedValue(null);

            await expect(StorageService.updateStory('nonexistent', {}))
                .rejects.toThrow('Failed to update story.');
        });

        it('throws a user-friendly error on write failure', async () => {
            const existing = makeStory('uuid-7', 6000);
            mockManifestStore.getItem.mockResolvedValue(toLite(existing));
            mockPagesStore.getItem.mockResolvedValue(existing.pages);
            mockManifestStore.setItem.mockRejectedValue(new Error('Write failed'));

            await expect(StorageService.updateStory('uuid-7', {}))
                .rejects.toThrow('Failed to update story.');
        });
    });

    // ── markAsRead ───────────────────────────────────────────────────

    describe('markAsRead', () => {
        it('sets hasBeenRead to true in manifest store', async () => {
            const story = makeStory('uuid-read', 1000);
            const lite = toLite(story);
            mockManifestStore.getItem.mockResolvedValue({ ...lite });
            mockManifestStore.setItem.mockResolvedValue(undefined);

            await StorageService.markAsRead('uuid-read');

            expect(mockManifestStore.setItem).toHaveBeenCalledWith(
                'uuid-read',
                expect.objectContaining({
                    metadata: expect.objectContaining({ hasBeenRead: true }),
                })
            );
        });

        it('does nothing when manifest is not found', async () => {
            mockManifestStore.getItem.mockResolvedValue(null);

            await StorageService.markAsRead('nonexistent');

            expect(mockManifestStore.setItem).not.toHaveBeenCalled();
        });
    });
});
