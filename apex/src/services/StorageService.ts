import localforage from 'localforage';
import { IStoryManifest } from '../types/story.types';

// Configure localForage to explicitly prefer IndexedDB
const storyStore = localforage.createInstance({
    name: 'ApexPredatorApp',
    storeName: 'narrative_stories',
    description: 'IndexedDB store for 32-page generative stories',
    driver: localforage.INDEXEDDB
});

export class StorageService {
    /**
     * Saves a story to IndexedDB
     */
    static async saveStory(story: IStoryManifest): Promise<void> {
        try {
            await storyStore.setItem(story.metadata.id, story);
        } catch (error) {
            console.error('Error saving story to IndexedDB:', error);
            throw new Error('Failed to persist story.');
        }
    }

    /**
     * Retrieves a single story by its UUID
     */
    static async getStory(id: string): Promise<IStoryManifest | null> {
        try {
            const story = await storyStore.getItem<IStoryManifest>(id);
            return story;
        } catch (error) {
            console.error('Error fetching story from IndexedDB:', error);
            return null;
        }
    }

    /**
     * Retrieves all stories from the store, sorted by newest first
     */
    static async getAllStories(): Promise<IStoryManifest[]> {
        try {
            const stories: IStoryManifest[] = [];
            await storyStore.iterate((value: IStoryManifest) => {
                stories.push(value);
            });
            return stories.sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
        } catch (error) {
            console.error('Error fetching all stories:', error);
            return [];
        }
    }

    /**
     * Removes a story from the store
     */
    static async deleteStory(id: string): Promise<void> {
        try {
            await storyStore.removeItem(id);
        } catch (error) {
            console.error('Error deleting story:', error);
            throw new Error('Failed to delete story.');
        }
    }

    /**
     * Updates an existing story (e.g., marking it as read)
     */
    static async updateStory(id: string, updates: Partial<IStoryManifest>): Promise<void> {
        try {
            const existing = await this.getStory(id);
            if (!existing) throw new Error('Story not found for update.');

            const updatedStory: IStoryManifest = { ...existing, ...updates };
            await storyStore.setItem(id, updatedStory);
        } catch (error) {
            console.error('Error updating story:', error);
            throw new Error('Failed to update story.');
        }
    }
}
