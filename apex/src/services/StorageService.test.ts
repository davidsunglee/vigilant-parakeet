import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IStoryManifest } from '../types/story.types';

// Use vi.hoisted so the mock object is available when vi.mock is hoisted
const mockStore = vi.hoisted(() => ({
    setItem: vi.fn(),
    getItem: vi.fn(),
    removeItem: vi.fn(),
    iterate: vi.fn(),
}));

vi.mock('localforage', () => ({
    default: {
        createInstance: vi.fn(() => mockStore),
        INDEXEDDB: 'asyncStorage',
    },
}));

// Import after mock is set up
import { StorageService } from './StorageService';

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
        pages: [],
        checklist: { items: [] },
        outcome: {
            winnerId: 'animalA', logicalReasoning: 'Faster',
            isSurpriseEnding: false, endingType: 'Standard Victory',
        },
        ...overrides,
    };
}

describe('StorageService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    // ── saveStory ────────────────────────────────────────────────────

    describe('saveStory', () => {
        it('saves a story to the store using its metadata id as key', async () => {
            const story = makeStory('uuid-1', 1000);
            mockStore.setItem.mockResolvedValue(undefined);

            await StorageService.saveStory(story);

            expect(mockStore.setItem).toHaveBeenCalledWith('uuid-1', story);
        });

        it('throws a user-friendly error when IndexedDB fails', async () => {
            const story = makeStory('uuid-2', 2000);
            mockStore.setItem.mockRejectedValue(new Error('QuotaExceeded'));

            await expect(StorageService.saveStory(story))
                .rejects.toThrow('Failed to persist story.');
        });
    });

    // ── getStory ─────────────────────────────────────────────────────

    describe('getStory', () => {
        it('returns the story when found', async () => {
            const story = makeStory('uuid-3', 3000);
            mockStore.getItem.mockResolvedValue(story);

            const result = await StorageService.getStory('uuid-3');
            expect(result).toEqual(story);
            expect(mockStore.getItem).toHaveBeenCalledWith('uuid-3');
        });

        it('returns null when story is not found', async () => {
            mockStore.getItem.mockResolvedValue(null);

            const result = await StorageService.getStory('nonexistent');
            expect(result).toBeNull();
        });

        it('returns null on error', async () => {
            mockStore.getItem.mockRejectedValue(new Error('DB corrupted'));

            const result = await StorageService.getStory('uuid-4');
            expect(result).toBeNull();
        });
    });

    // ── getAllStories ────────────────────────────────────────────────

    describe('getAllStories', () => {
        it('returns stories sorted by createdAt descending (newest first)', async () => {
            const storyOld = makeStory('old', 1000);
            const storyMid = makeStory('mid', 2000);
            const storyNew = makeStory('new', 3000);

            // Simulate localforage.iterate: calls the callback for each stored item
            mockStore.iterate.mockImplementation(async (cb: (value: IStoryManifest) => void) => {
                cb(storyOld);
                cb(storyNew);
                cb(storyMid);
            });

            const result = await StorageService.getAllStories();

            expect(result).toHaveLength(3);
            expect(result[0].metadata.id).toBe('new');
            expect(result[1].metadata.id).toBe('mid');
            expect(result[2].metadata.id).toBe('old');
        });

        it('returns empty array when store is empty', async () => {
            mockStore.iterate.mockImplementation(async () => {});

            const result = await StorageService.getAllStories();
            expect(result).toEqual([]);
        });

        it('returns empty array on error', async () => {
            mockStore.iterate.mockRejectedValue(new Error('DB error'));

            const result = await StorageService.getAllStories();
            expect(result).toEqual([]);
        });
    });

    // ── deleteStory ──────────────────────────────────────────────────

    describe('deleteStory', () => {
        it('removes the item from the store', async () => {
            mockStore.removeItem.mockResolvedValue(undefined);

            await StorageService.deleteStory('uuid-5');
            expect(mockStore.removeItem).toHaveBeenCalledWith('uuid-5');
        });

        it('throws a user-friendly error on failure', async () => {
            mockStore.removeItem.mockRejectedValue(new Error('DB locked'));

            await expect(StorageService.deleteStory('uuid-5'))
                .rejects.toThrow('Failed to delete story.');
        });
    });

    // ── updateStory ──────────────────────────────────────────────────

    describe('updateStory', () => {
        it('merges updates into the existing story and saves it', async () => {
            const existing = makeStory('uuid-6', 5000);
            mockStore.getItem.mockResolvedValue(existing);
            mockStore.setItem.mockResolvedValue(undefined);

            await StorageService.updateStory('uuid-6', {
                metadata: { ...existing.metadata, hasBeenRead: true },
            });

            expect(mockStore.setItem).toHaveBeenCalledWith(
                'uuid-6',
                expect.objectContaining({
                    metadata: expect.objectContaining({ hasBeenRead: true }),
                })
            );
        });

        it('throws when the story is not found', async () => {
            mockStore.getItem.mockResolvedValue(null);

            await expect(StorageService.updateStory('nonexistent', {}))
                .rejects.toThrow('Failed to update story.');
        });

        it('throws a user-friendly error on write failure', async () => {
            const existing = makeStory('uuid-7', 6000);
            mockStore.getItem.mockResolvedValue(existing);
            mockStore.setItem.mockRejectedValue(new Error('Write failed'));

            await expect(StorageService.updateStory('uuid-7', {}))
                .rejects.toThrow('Failed to update story.');
        });
    });
});
