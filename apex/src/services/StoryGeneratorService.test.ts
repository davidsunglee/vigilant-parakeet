import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AiConfig } from '../contexts/AiConfigContext';
import type { IAnimalEntity } from '../types/story.types';

// Mock dependencies
vi.mock('./LlmService', () => ({
    LlmService: {
        getAnimalProfile: vi.fn(),
        getAspectsForAnimal: vi.fn(),
        getShowdownAndOutcome: vi.fn(),
    },
}));

vi.mock('./ImageService', () => ({
    ImageService: {
        generateImage: vi.fn(),
    },
}));

vi.mock('p-limit', () => {
    return {
        default: (concurrency: number) => {
            // Return a real p-limit-like function that respects concurrency
            return <T>(fn: () => Promise<T>): Promise<T> => fn();
        },
    };
});

import { StoryGeneratorService } from './StoryGeneratorService';
import { LlmService } from './LlmService';
import { ImageService } from './ImageService';

const mockConfig: AiConfig = {
    llmProvider: 'anthropic',
    llmModel: 'claude-3',
    imageProvider: 'gemini',
    imageModel: 'imagen-3',
};

const mockProfileA = {
    scientificName: 'Panthera leo',
    habitat: 'Savannah',
    stats: { weight: '190 kg', length: '2.5 m', speed: '80 km/h', weaponry: 'Claws', armor: 'Mane', brainSize: 'Large' },
};

const mockProfileB = {
    scientificName: 'Panthera tigris',
    habitat: 'Jungle',
    stats: { weight: '220 kg', length: '3.0 m', speed: '65 km/h', weaponry: 'Claws', armor: 'Stripes', brainSize: 'Large' },
};

function makeMockAspects(animalPrefix: string) {
    const aspects = [
        'Scientific Classification', 'Natural Habitat', 'Size & Weight',
        'Hunting & Diet', 'Social Behavior', 'Senses: Sight, Hearing & Smell',
        'Weapons & Offense', 'Defenses & Armor', 'Speed & Agility',
        'Intelligence & Anatomy', 'Secret Weapons', 'Overall Threat Level',
    ];
    return aspects.map((name) => ({
        aspectName: name,
        bodyText: `${animalPrefix} ${name} text.`,
        visualPrompt: `${animalPrefix} ${name} visual`,
    }));
}

const mockOutcomeData = {
    checklist: {
        items: [
            { traitName: 'Speed', animalAAdvantage: true, animalBAdvantage: false },
            { traitName: 'Strength', animalAAdvantage: false, animalBAdvantage: true },
        ],
    },
    logicalReasoning: 'Lion is faster but Tiger is stronger.',
    showdownText: { bodyText: 'They face off!', visualPrompt: 'Both animals staring' },
    outcomeText: { bodyText: 'Lion wins!', visualPrompt: 'Lion stands victorious' },
};

function setupDefaultMocks() {
    vi.mocked(LlmService.getAnimalProfile)
        .mockResolvedValueOnce(mockProfileA)
        .mockResolvedValueOnce(mockProfileB);

    vi.mocked(LlmService.getShowdownAndOutcome).mockResolvedValue(mockOutcomeData);

    vi.mocked(LlmService.getAspectsForAnimal)
        .mockResolvedValueOnce(makeMockAspects('Lion'))
        .mockResolvedValueOnce(makeMockAspects('Tiger'));

    vi.mocked(ImageService.generateImage).mockResolvedValue('data:image/png;base64,mockimg');
}

describe('StoryGeneratorService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        // Fix Math.random so outcomes are deterministic
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        // Mock crypto.randomUUID
        vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid-1234' as `${string}-${string}-${string}-${string}-${string}`);
    });

    it('orchestrates the full story generation flow', async () => {
        setupDefaultMocks();

        const manifest = await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger');

        // Profiles fetched
        expect(LlmService.getAnimalProfile).toHaveBeenCalledTimes(2);
        // Showdown fetched
        expect(LlmService.getShowdownAndOutcome).toHaveBeenCalledOnce();
        // Aspects fetched for both animals
        expect(LlmService.getAspectsForAnimal).toHaveBeenCalledTimes(2);
        // Images generated for 26 pages + 1 cover = 27 calls
        expect(ImageService.generateImage).toHaveBeenCalledTimes(27);

        expect(manifest).toBeDefined();
    });

    it('runs showdown, aspects, and cover image in parallel after profiles', async () => {
        setupDefaultMocks();

        await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger');

        // Showdown, both aspects, and cover image should all be called
        expect(LlmService.getShowdownAndOutcome).toHaveBeenCalledOnce();
        expect(LlmService.getAspectsForAnimal).toHaveBeenCalledTimes(2);
        // Cover image is now generated in the parallel batch (not at the end)
        // Total: 26 page images + 1 cover = 27
        expect(ImageService.generateImage).toHaveBeenCalledTimes(27);
    });

    it('constructs animal entities with id, commonName, and profile data', async () => {
        setupDefaultMocks();

        const manifest = await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger');

        expect(manifest.animalA).toEqual(expect.objectContaining({
            id: 'animalA',
            commonName: 'Lion',
            scientificName: 'Panthera leo',
            habitat: 'Savannah',
        }));

        expect(manifest.animalB).toEqual(expect.objectContaining({
            id: 'animalB',
            commonName: 'Tiger',
            scientificName: 'Panthera tigris',
            habitat: 'Jungle',
        }));
    });

    it('generates exactly 26 pages (12 aspect pairs + showdown + outcome)', async () => {
        setupDefaultMocks();

        const manifest = await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger');

        expect(manifest.pages).toHaveLength(26);
    });

    it('assigns correct page indices: aspect pages 1-24, showdown 31, outcome 32', async () => {
        setupDefaultMocks();

        const manifest = await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger');

        // First aspect pair
        expect(manifest.pages[0].index).toBe(1);
        expect(manifest.pages[1].index).toBe(2);
        // Last aspect pair
        expect(manifest.pages[22].index).toBe(23);
        expect(manifest.pages[23].index).toBe(24);
        // Showdown & Outcome
        expect(manifest.pages[24].index).toBe(31);
        expect(manifest.pages[25].index).toBe(32);
    });

    it('alternates left/right pages: odd indices are left, even are right', async () => {
        setupDefaultMocks();

        const manifest = await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger');

        // Aspect pages: left/right alternation
        for (let i = 0; i < 24; i++) {
            const page = manifest.pages[i];
            if (i % 2 === 0) {
                expect(page.isLeftPage).toBe(true);
            } else {
                expect(page.isLeftPage).toBe(false);
            }
        }
        // Showdown is left, Outcome is right
        expect(manifest.pages[24].isLeftPage).toBe(true);
        expect(manifest.pages[25].isLeftPage).toBe(false);
    });

    it('generates page images using p-limit concurrency', async () => {
        setupDefaultMocks();

        const callOrder: number[] = [];
        let callIndex = 0;
        vi.mocked(ImageService.generateImage).mockImplementation(async () => {
            callOrder.push(callIndex++);
            return 'data:image/png;base64,mockimg';
        });

        await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger');

        // 26 page images + 1 cover = 27 total calls
        expect(ImageService.generateImage).toHaveBeenCalledTimes(27);
    });

    it('generates a cover image with both animal names in the parallel batch', async () => {
        setupDefaultMocks();

        const calls: string[] = [];
        vi.mocked(ImageService.generateImage).mockImplementation(async (_config, prompt) => {
            calls.push(prompt);
            return 'data:image/png;base64,mockimg';
        });

        const manifest = await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger');

        // The cover image is now generated first (in the parallel batch before page images)
        const coverPrompt = calls[0];
        expect(coverPrompt).toContain('Lion');
        expect(coverPrompt).toContain('Tiger');
        expect(manifest.coverImageUrl).toBe('data:image/png;base64,mockimg');
    });

    it('builds manifest metadata with crypto.randomUUID(), title, and timestamps', async () => {
        setupDefaultMocks();

        const before = Date.now();
        const manifest = await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger');

        expect(manifest.metadata.id).toBe('test-uuid-1234');
        expect(manifest.metadata.title).toBe('Who Would Win? Lion vs. Tiger');
        expect(manifest.metadata.createdAt).toBeGreaterThanOrEqual(before);
        expect(manifest.metadata.hasBeenRead).toBe(false);
    });

    it('sets winnerId to a valid animal when not a surprise ending', async () => {
        let callCount = 0;
        vi.spyOn(Math, 'random').mockImplementation(() => {
            callCount++;
            // First call: rollForSurpriseEnding => floor(0.3*7)+1 = 3, not 7
            if (callCount === 1) return 0.3;
            // Second call: winnerId => 0.8 > 0.5 => 'animalA'
            if (callCount === 2) return 0.8;
            return 0.5;
        });

        setupDefaultMocks();
        const manifest = await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger');

        expect(manifest.outcome.isSurpriseEnding).toBe(false);
        expect(manifest.outcome.winnerId).toBe('animalA');
        expect(manifest.outcome.endingType).toBe('Standard Victory');
    });

    it('sets winnerId to "none" and picks a surprise ending type when roll is 7', async () => {
        let callCount = 0;
        vi.spyOn(Math, 'random').mockImplementation(() => {
            callCount++;
            // First call: rollForSurpriseEnding => floor(val*7)+1 = 7, so val must give floor(val*7)=6 => val in [6/7, 1) => 0.9
            if (callCount === 1) return 0.9;
            // Second call: determineEndingType => types[floor(0.5*4)] = types[2] = 'The Bigger Fish'
            if (callCount === 2) return 0.5;
            return 0.5;
        });

        setupDefaultMocks();
        const manifest = await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger');

        expect(manifest.outcome.isSurpriseEnding).toBe(true);
        expect(manifest.outcome.winnerId).toBe('none');
        expect(manifest.outcome.endingType).toBe('The Bigger Fish');
    });

    it('includes the ending type options: External Event, Trait-Based Retreat, The Bigger Fish, Mutual Neutrality', async () => {
        const endingTypes = [
            'External Event',
            'Trait-Based Retreat',
            'The Bigger Fish',
            'Mutual Neutrality',
        ];

        for (let typeIndex = 0; typeIndex < endingTypes.length; typeIndex++) {
            vi.clearAllMocks();
            vi.spyOn(console, 'log').mockImplementation(() => {});
            vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid-1234' as `${string}-${string}-${string}-${string}-${string}`);

            let callCount = 0;
            vi.spyOn(Math, 'random').mockImplementation(() => {
                callCount++;
                if (callCount === 1) return 0.9; // surprise ending
                if (callCount === 2) return typeIndex / 4; // select ending type
                return 0.5;
            });

            setupDefaultMocks();
            const manifest = await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger');

            expect(manifest.outcome.endingType).toBe(endingTypes[typeIndex]);
        }
    });

    it('calls onProgress callback at key milestones', async () => {
        setupDefaultMocks();

        const progressCalls: [string, number][] = [];
        const onProgress = vi.fn((step: string, pct: number) => {
            progressCalls.push([step, pct]);
        });

        await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger', onProgress);

        // Check that progress was called at key milestones
        expect(onProgress).toHaveBeenCalled();

        // First call: researching profiles
        expect(progressCalls[0]).toEqual(['Researching animal profiles...', 5]);

        // Second call: simulating the showdown
        expect(progressCalls[1]).toEqual(['Simulating the showdown...', 15]);

        // Third call: illustrating pages
        expect(progressCalls[2]).toEqual(['Illustrating pages...', 25]);

        // Per-page progress calls (26 pages)
        const illustratingCalls = progressCalls.filter(([step]) => /^Illustrating page \d+/.test(step));
        expect(illustratingCalls).toHaveLength(26);

        // Saving call should be present
        const savingCalls = progressCalls.filter(([step]) => step === 'Saving your story...');
        expect(savingCalls).toHaveLength(1);
        expect(savingCalls[0]).toEqual(['Saving your story...', 98]);

        // Saving should be the last call
        expect(progressCalls[progressCalls.length - 1]).toEqual(['Saving your story...', 98]);
    });

    it('works without onProgress callback (backward compatible)', async () => {
        setupDefaultMocks();

        // Should not throw when no callback is provided
        const manifest = await StoryGeneratorService.generateStory(mockConfig, 'Lion', 'Tiger');
        expect(manifest).toBeDefined();
    });
});
