import { IStoryManifest, StoryRecord } from '../types/story.types';

export function createMockStory(overrides: Partial<IStoryManifest> = {}): IStoryManifest {
  return {
    metadata: {
      id: 'story-1',
      title: 'Who Would Win? Lion vs. Tiger',
      createdAt: Date.now(),
      hasBeenRead: false,
      ...overrides.metadata,
    },
    animalA: {
      id: 'animalA',
      commonName: 'Lion',
      scientificName: 'Panthera leo',
      stats: { weight: '190 kg', length: '2.5 m', speed: '80 km/h' },
      habitat: 'African savanna',
      ...overrides.animalA,
    },
    animalB: {
      id: 'animalB',
      commonName: 'Tiger',
      scientificName: 'Panthera tigris',
      stats: { weight: '220 kg', length: '3 m', speed: '65 km/h' },
      habitat: 'Asian forests',
      ...overrides.animalB,
    },
    coverImageUrl: 'coverImageUrl' in overrides ? overrides.coverImageUrl : 'http://example.com/cover.png',
    pages: overrides.pages ?? [
      {
        index: 1,
        title: 'Scientific Classification',
        bodyText: 'The lion is a large cat.',
        visualPrompt: 'A majestic lion',
        imageUrl: 'http://example.com/page1.png',
        funFact: 'Lions can sleep 20 hours a day!',
        isLeftPage: true,
      },
      {
        index: 2,
        title: '',
        bodyText: 'The tiger is the largest cat species.',
        visualPrompt: 'A powerful tiger',
        isLeftPage: false,
      },
    ],
    checklist: overrides.checklist ?? {
      items: [
        { traitName: 'Speed', animalAAdvantage: true, animalBAdvantage: false },
        { traitName: 'Strength', animalAAdvantage: false, animalBAdvantage: true },
      ],
    },
    outcome: overrides.outcome ?? {
      winnerId: 'animalA',
      logicalReasoning: 'The lion wins due to superior teamwork.',
      isSurpriseEnding: false,
      endingType: 'Standard Victory',
    },
  };
}

/**
 * Builds a mock `stories` row (the Supabase `StoryRecord` shape). Defaults to a
 * `ready` story whose `manifest` is a full `createMockStory()` and whose
 * `cover_image_path` is a Storage path. Override any column via `overrides`.
 */
export function createMockStoryRecord(overrides: Partial<StoryRecord> = {}): StoryRecord {
  return {
    id: 'story-1',
    owner_id: 'owner-1',
    status: 'ready',
    animal_a: 'Lion',
    animal_b: 'Tiger',
    title: 'Who Would Win? Lion vs. Tiger',
    art_style: 'surprise',
    fierce_mode: false,
    cover_image_path: 'stories/story-1/cover.png',
    manifest: createMockStory(),
    progress_step: null,
    progress_pct: 100,
    error: null,
    created_at: '2026-06-14T00:00:00.000Z',
    updated_at: '2026-06-14T00:00:00.000Z',
    ...overrides,
  };
}

export function createMockStoryWithSurprise(): IStoryManifest {
  return createMockStory({
    metadata: {
      id: 'story-surprise',
      title: 'Who Would Win? Bear vs. Shark',
      createdAt: Date.now() - 10000,
      hasBeenRead: false,
    },
    outcome: {
      winnerId: 'none',
      logicalReasoning: 'An earthquake interrupted the battle.',
      isSurpriseEnding: true,
      endingType: 'External Event',
    },
  });
}
