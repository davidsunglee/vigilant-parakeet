import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { runGenerationPipeline, timers, type GenerateStoryPayload } from '../pipeline';
import { LlmClient } from '../llm';
import { ImageClient } from '../image';
import type { IImageProvider, ILlmProvider } from '../../providers/types';

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

const mockVisualAnchor = {
  animalA: {
    artStyle: 'soft watercolor',
    speciesDescription: 'adult male African lion',
    bodyColors: 'golden-tawny fur',
    markings: 'dark brown mane',
    faceShape: 'broad square jaw',
    fullDescription: 'A soft watercolor illustration of an adult male African lion.',
  },
  animalB: {
    artStyle: 'soft watercolor',
    speciesDescription: 'adult male Bengal tiger',
    bodyColors: 'orange fur with white underbelly',
    markings: 'black stripes',
    faceShape: 'round face with prominent whiskers',
    fullDescription: 'A soft watercolor illustration of an adult male Bengal tiger.',
  },
};

const PAYLOAD: GenerateStoryPayload = {
  storyId: 'story-1',
  ownerId: 'owner-1',
  animalA: 'Lion',
  animalB: 'Tiger',
  options: { artStyle: 'surprise', fierceMode: false },
};

function makeDeps(overrides?: {
  imageExists?: () => Promise<boolean>;
  loadCheckpoint?: () => Promise<any>;
}) {
  const progressCalls: Array<[string, number]> = [];
  const uploadedPaths: string[] = [];

  const llm = {
    getAnimalProfile: mock(async (name: string) => (name === 'Lion' ? mockProfileA : mockProfileB)),
    getAspectsForAnimal: mock(async (animal: any) => makeMockAspects(animal.commonName)),
    getShowdownAndOutcome: mock(async () => mockOutcomeData),
    getAnimalVisualDescriptions: mock(async () => mockVisualAnchor),
  };

  const image = {
    generateImage: mock(async () => 'base64payload'),
  };

  const storage = {
    uploadImage: mock(async (path: string, _b64: string) => {
      uploadedPaths.push(path);
      return path;
    }),
    imageExists: mock(overrides?.imageExists ?? (async () => false)),
  };

  const db = {
    loadCheckpoint: mock(overrides?.loadCheckpoint ?? (async () => null)),
    updateProgress: mock(async (_id: string, step: string, pct: number) => {
      progressCalls.push([step, pct]);
    }),
    saveManifest: mock(async () => {}),
    setCoverPath: mock(async () => {}),
  };

  const deps = {
    llm: llm as unknown as LlmClient,
    image: image as unknown as ImageClient,
    storage,
    db,
  };

  return { deps, llm, image, storage, db, progressCalls, uploadedPaths };
}

describe('runGenerationPipeline', () => {
  beforeEach(() => {
    // Deterministic surprise roll + winner; never wait on the real 15s delay.
    spyOn(Math, 'random').mockReturnValue(0.5);
    spyOn(timers, 'sleep').mockResolvedValue(undefined);
  });

  it('produces 26 pages (12 aspect pairs + showdown + outcome)', async () => {
    const { deps } = makeDeps();
    const manifest = await runGenerationPipeline(deps, PAYLOAD);
    expect(manifest.pages).toHaveLength(26);
  });

  it('assigns page indices 1/2 … 23/24, then 31 and 32', async () => {
    const { deps } = makeDeps();
    const manifest = await runGenerationPipeline(deps, PAYLOAD);

    expect(manifest.pages[0].index).toBe(1);
    expect(manifest.pages[1].index).toBe(2);
    expect(manifest.pages[22].index).toBe(23);
    expect(manifest.pages[23].index).toBe(24);
    expect(manifest.pages[24].index).toBe(31);
    expect(manifest.pages[25].index).toBe(32);
  });

  it('alternates left/right pages: odd positions left, even positions right', async () => {
    const { deps } = makeDeps();
    const manifest = await runGenerationPipeline(deps, PAYLOAD);

    for (let i = 0; i < 24; i++) {
      expect(manifest.pages[i].isLeftPage).toBe(i % 2 === 0);
    }
    expect(manifest.pages[24].isLeftPage).toBe(true); // showdown
    expect(manifest.pages[25].isLeftPage).toBe(false); // outcome
  });

  it('generates exactly 27 images on a clean run (cover + 26 pages)', async () => {
    const { deps, image } = makeDeps();
    await runGenerationPipeline(deps, PAYLOAD);
    expect(image.generateImage).toHaveBeenCalledTimes(27);
  });

  it('stores Storage paths (not base64) in image fields', async () => {
    const { deps } = makeDeps();
    const manifest = await runGenerationPipeline(deps, PAYLOAD);

    expect(manifest.coverImageUrl).toBe('stories/story-1/cover.png');
    for (const page of manifest.pages) {
      expect(page.imageUrl).toMatch(/^stories\/story-1\/\d+\.png$/);
    }
    // Spot-check specific indices.
    expect(manifest.pages[0].imageUrl).toBe('stories/story-1/1.png');
    expect(manifest.pages[24].imageUrl).toBe('stories/story-1/31.png');
    expect(manifest.pages[25].imageUrl).toBe('stories/story-1/32.png');
  });

  it('calls updateProgress at the milestone steps', async () => {
    const { deps, progressCalls } = makeDeps();
    await runGenerationPipeline(deps, PAYLOAD);

    const steps = progressCalls.map(([step]) => step);
    expect(steps).toContain('Researching animal profiles...');
    expect(steps).toContain('Designing animal illustrations...');
    expect(steps).toContain('Simulating the showdown...');
    expect(steps).toContain('Illustrating pages...');
    expect(steps).toContain('Saving your story...');

    const perPage = progressCalls.filter(([step]) => /^Illustrating page \d+ of 26\.\.\.$/.test(step));
    expect(perPage).toHaveLength(26);
    expect(progressCalls[progressCalls.length - 1]).toEqual(['Saving your story...', 98]);
  });

  it('skips all image generation when every object already exists (cached resume → 0 generations)', async () => {
    const { deps, image, storage } = makeDeps({ imageExists: async () => true });
    const manifest = await runGenerationPipeline(deps, PAYLOAD);

    expect(image.generateImage).toHaveBeenCalledTimes(0);
    expect(storage.uploadImage).toHaveBeenCalledTimes(0);

    // The manifest still carries every Storage path.
    expect(manifest.coverImageUrl).toBe('stories/story-1/cover.png');
    expect(manifest.pages).toHaveLength(26);
    for (const page of manifest.pages) {
      expect(page.imageUrl).toMatch(/^stories\/story-1\/\d+\.png$/);
    }
  });
});

describe('userId threading at the client layer', () => {
  it('threads userId into the LLM adapter call', async () => {
    const adapter = {
      generate: mock(async () => ({ data: mockProfileA })),
    };
    const client = new LlmClient(adapter as unknown as ILlmProvider, 'claude-sonnet-4-20250514', 'owner-xyz');

    await client.getAnimalProfile('Lion');

    expect(adapter.generate).toHaveBeenCalledTimes(1);
    const arg = (adapter.generate.mock.calls[0] as any[])[0];
    expect(arg.userId).toBe('owner-xyz');
    expect(arg.model).toBe('claude-sonnet-4-20250514');
  });

  it('threads userId and quality into the image adapter call', async () => {
    const adapter = {
      generate: mock(async () => ({ imageDataUri: 'data:image/png;base64,xyz' })),
    };
    const client = new ImageClient(adapter as unknown as IImageProvider, 'gpt-image-2', 'medium', 'owner-xyz');

    const out = await client.generateImage('a lion roaring', { aspectRatio: '4:3' });

    expect(out).toBe('xyz'); // base64 prefix stripped
    expect(adapter.generate).toHaveBeenCalledTimes(1);
    const arg = (adapter.generate.mock.calls[0] as any[])[0];
    expect(arg.userId).toBe('owner-xyz');
    expect(arg.quality).toBe('medium');
  });
});
