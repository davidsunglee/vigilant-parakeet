import localforage from 'localforage';
import { IStoryManifest, IStoryManifestLite, IPageContent } from '../types/story.types';

// Legacy store — kept for backward-compatible migration
const storyStore = localforage.createInstance({
    name: 'ApexPredatorApp',
    storeName: 'narrative_stories',
    description: 'IndexedDB store for 32-page generative stories',
    driver: localforage.INDEXEDDB
});

// New split stores
const manifestStore = localforage.createInstance({
    name: 'ApexPredatorApp',
    storeName: 'story_manifests',
});

const pagesStore = localforage.createInstance({
    name: 'ApexPredatorApp',
    storeName: 'story_pages',
});

/**
 * Extracts a lightweight manifest (no pages) from a full story manifest.
 */
function toLite(story: IStoryManifest): IStoryManifestLite {
    return {
        metadata: story.metadata,
        animalA: story.animalA,
        animalB: story.animalB,
        coverImageUrl: story.coverImageUrl,
        checklist: story.checklist,
        outcome: story.outcome,
        ...(story.visualAnchor && { visualAnchor: story.visualAnchor }),
    };
}

export class StorageService {
    /**
     * Saves a story to both split stores.
     * Accepts a full IStoryManifest for backward compatibility.
     */
    static async saveStory(story: IStoryManifest): Promise<void> {
        try {
            const id = story.metadata.id;
            await Promise.all([
                manifestStore.setItem(id, toLite(story)),
                pagesStore.setItem(id, story.pages),
            ]);
        } catch (error) {
            console.error('Error saving story to IndexedDB:', error);
            throw new Error('Failed to persist story.');
        }
    }

    /**
     * Returns all lightweight manifests (no pages), sorted newest first.
     * Used by the Dashboard for fast listing.
     */
    static async getAllManifests(): Promise<IStoryManifestLite[]> {
        try {
            const manifests: IStoryManifestLite[] = [];
            await manifestStore.iterate((value: IStoryManifestLite) => {
                manifests.push(value);
            });

            // Migrate any stories in the legacy store that haven't been migrated
            const legacyIds = new Set<string>();
            const legacyStories: IStoryManifest[] = [];
            await storyStore.iterate((value: IStoryManifest) => {
                legacyStories.push(value);
                legacyIds.add(value.metadata.id);
            });

            const migratedIds = new Set(manifests.map(m => m.metadata.id));
            for (const legacy of legacyStories) {
                if (!migratedIds.has(legacy.metadata.id)) {
                    const lite = toLite(legacy);
                    manifests.push(lite);
                    // Migrate in the background
                    manifestStore.setItem(legacy.metadata.id, lite);
                    pagesStore.setItem(legacy.metadata.id, legacy.pages);
                    storyStore.removeItem(legacy.metadata.id);
                }
            }

            return manifests.sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
        } catch (error) {
            console.error('Error fetching all manifests:', error);
            return [];
        }
    }

    /**
     * Returns pages for a story by ID.
     */
    static async getStoryPages(id: string): Promise<IPageContent[]> {
        try {
            const pages = await pagesStore.getItem<IPageContent[]>(id);
            if (pages) return pages;

            // Fallback: check legacy store
            const legacy = await storyStore.getItem<IStoryManifest>(id);
            if (legacy) {
                // Migrate
                await Promise.all([
                    manifestStore.setItem(id, toLite(legacy)),
                    pagesStore.setItem(id, legacy.pages),
                    storyStore.removeItem(id),
                ]);
                return legacy.pages;
            }

            return [];
        } catch (error) {
            console.error('Error fetching story pages:', error);
            return [];
        }
    }

    /**
     * Reconstructs a full IStoryManifest from both stores.
     * Falls back to legacy store if needed.
     */
    static async getStory(id: string): Promise<IStoryManifest | null> {
        try {
            const manifest = await manifestStore.getItem<IStoryManifestLite>(id);
            if (manifest) {
                const pages = await pagesStore.getItem<IPageContent[]>(id) ?? [];
                return { ...manifest, pages };
            }

            // Fallback: check legacy store and migrate
            const legacy = await storyStore.getItem<IStoryManifest>(id);
            if (legacy) {
                await Promise.all([
                    manifestStore.setItem(id, toLite(legacy)),
                    pagesStore.setItem(id, legacy.pages),
                    storyStore.removeItem(id),
                ]);
                return legacy;
            }

            return null;
        } catch (error) {
            console.error('Error fetching story from IndexedDB:', error);
            return null;
        }
    }

    /**
     * Retrieves all stories from the store, sorted by newest first.
     * Kept for backward compatibility — reconstructs full manifests.
     */
    static async getAllStories(): Promise<IStoryManifest[]> {
        try {
            const manifests = await this.getAllManifests();
            const stories: IStoryManifest[] = [];
            for (const manifest of manifests) {
                const pages = await pagesStore.getItem<IPageContent[]>(manifest.metadata.id) ?? [];
                stories.push({ ...manifest, pages });
            }
            return stories;
        } catch (error) {
            console.error('Error fetching all stories:', error);
            return [];
        }
    }

    /**
     * Removes a story from all stores.
     */
    static async deleteStory(id: string): Promise<void> {
        try {
            await Promise.all([
                manifestStore.removeItem(id),
                pagesStore.removeItem(id),
                storyStore.removeItem(id),
            ]);
        } catch (error) {
            console.error('Error deleting story:', error);
            throw new Error('Failed to delete story.');
        }
    }

    /**
     * Updates an existing story (e.g., marking it as read).
     */
    static async updateStory(id: string, updates: Partial<IStoryManifest>): Promise<void> {
        try {
            const existing = await this.getStory(id);
            if (!existing) throw new Error('Story not found for update.');

            const updatedStory: IStoryManifest = { ...existing, ...updates };
            await this.saveStory(updatedStory);
        } catch (error) {
            console.error('Error updating story:', error);
            throw new Error('Failed to update story.');
        }
    }

    /**
     * Directly marks a story as read without re-reading the full story.
     * Only updates the manifest store.
     */
    static async markAsRead(id: string): Promise<void> {
        const manifest = await manifestStore.getItem<IStoryManifestLite>(id);
        if (manifest) {
            const updated: IStoryManifestLite = {
                ...manifest,
                metadata: { ...manifest.metadata, hasBeenRead: true },
            };
            await manifestStore.setItem(id, updated);
        }
    }
}
