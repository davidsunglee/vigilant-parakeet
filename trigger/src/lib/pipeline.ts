import pLimit from 'p-limit';
import {
  IStoryManifest,
  IBattleOutcome,
  IAnimalEntity,
  IPageContent,
  ITraitChecklist,
} from '../types/story.types';
import {
  FIERCE_MODE_DESCRIPTOR,
  StoryGeneratorOptions,
  getArtStyleDescriptor,
} from '../types/artStyle';
import { LlmClient } from './llm';
import { ImageClient } from './image';

/** OpenAI image path bound: at most 2 in flight, 15s between requests. */
const INTER_REQUEST_DELAY_MS = 15_000;

/**
 * Indirection so tests can stub the inter-request delay without waiting on
 * real timers. Production resolves a real `setTimeout`.
 */
export const timers = {
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

const DEFAULT_OPTIONS: StoryGeneratorOptions = { artStyle: 'surprise', fierceMode: false };

const ASPECTS = [
  'Scientific Classification',
  'Natural Habitat',
  'Size & Weight',
  'Hunting & Diet',
  'Social Behavior',
  'Senses: Sight, Hearing & Smell',
  'Weapons & Offense',
  'Defenses & Armor',
  'Speed & Agility',
  'Intelligence & Anatomy',
  'Secret Weapons',
  'Overall Threat Level',
];

export interface PipelineDeps {
  llm: LlmClient;
  image: ImageClient;
  storage: {
    uploadImage(path: string, base64: string): Promise<string>;
    imageExists(path: string): Promise<boolean>;
  };
  db: {
    loadCheckpoint(storyId: string): Promise<Partial<IStoryManifest> | null>;
    updateProgress(storyId: string, step: string, pct: number): Promise<void>;
    saveManifest(storyId: string, manifest: Partial<IStoryManifest>): Promise<void>;
    setCoverPath(storyId: string, path: string): Promise<void>;
  };
}

export interface GenerateStoryPayload {
  storyId: string;
  ownerId: string;
  animalA: string;
  animalB: string;
  options: StoryGeneratorOptions;
}

function rollForSurpriseEnding(): boolean {
  const roll = Math.floor(Math.random() * 7) + 1;
  return roll === 7;
}

function determineEndingType(isSurprise: boolean): IBattleOutcome['endingType'] {
  if (!isSurprise) return 'Standard Victory';
  const types: Array<IBattleOutcome['endingType']> = [
    'External Event',
    'Trait-Based Retreat',
    'The Bigger Fish',
    'Mutual Neutrality',
  ];
  return types[Math.floor(Math.random() * types.length)];
}

/**
 * Pure generation orchestration with injected I/O. Ported from the client-side
 * StoryGeneratorService: same 12 aspects, surprise-ending roll, cover prompt,
 * parallel narrative+cover batch, page index scheme, and manifest assembly.
 *
 * Cost-resumption (Trigger.dev has no step.run memoization): narrative phases
 * persist to the manifest and are reused from the checkpoint on re-run; each
 * image is skipped if its Storage object already exists.
 */
export async function runGenerationPipeline(
  deps: PipelineDeps,
  payload: GenerateStoryPayload,
): Promise<IStoryManifest> {
  const { storyId } = payload;
  const animalAQuery = payload.animalA;
  const animalBQuery = payload.animalB;
  const options = payload.options ?? DEFAULT_OPTIONS;
  const fixedArtStyle = getArtStyleDescriptor(options.artStyle);
  const fierceMode = options.fierceMode;

  const cp = await deps.db.loadCheckpoint(storyId);

  // 1. Animal profiles (resume from checkpoint when present)
  let animalA: IAnimalEntity;
  let animalB: IAnimalEntity;
  if (cp?.animalA && cp?.animalB) {
    animalA = cp.animalA;
    animalB = cp.animalB;
  } else {
    await deps.db.updateProgress(storyId, 'Researching animal profiles...', 5);
    const [profileA, profileB] = await Promise.all([
      deps.llm.getAnimalProfile(animalAQuery),
      deps.llm.getAnimalProfile(animalBQuery),
    ]);
    animalA = { id: 'animalA', commonName: animalAQuery, ...profileA };
    animalB = { id: 'animalB', commonName: animalBQuery, ...profileB };
    await deps.db.saveManifest(storyId, { animalA, animalB });
  }

  // 1b. Canonical visual descriptions for consistent imagery
  let visualAnchor;
  if (cp?.visualAnchor) {
    visualAnchor = cp.visualAnchor;
  } else {
    await deps.db.updateProgress(storyId, 'Designing animal illustrations...', 10);
    visualAnchor = await deps.llm.getAnimalVisualDescriptions(animalA, animalB, {
      fixedArtStyle,
      fierceMode,
    });
    await deps.db.saveManifest(storyId, { visualAnchor });
  }

  const fierceClause = fierceMode ? ` ${FIERCE_MODE_DESCRIPTOR}` : '';
  const artStyleAnchor = `Generate an illustration in the following style: ${visualAnchor.animalA.artStyle}.${fierceClause} This is a children's educational book illustration.`;

  const coverPrompt = `A dramatic, dynamic children's book cover illustration showing a ${animalAQuery} and a ${animalBQuery} facing each other in an epic standoff. Both animals must be fully visible from head to tail. The scene should be intense and exciting, with both animals looking powerful and ready for battle. Bold, vibrant colors with an action-packed composition. No text in the image.

Animal A: ${visualAnchor.animalA.fullDescription}
Animal B: ${visualAnchor.animalB.fullDescription}`;

  // Cover image: skip-if-exists, otherwise generate → upload → record path.
  const resolveCover = async (): Promise<string> => {
    const coverPath = `stories/${storyId}/cover.png`;
    if (await deps.storage.imageExists(coverPath)) {
      // Record the path even on the skip-if-exists branch: a prior attempt may
      // have uploaded the object but failed before persisting cover_image_path,
      // and finalize() never sets it. Without this the ready story has no
      // dashboard thumbnail.
      await deps.db.setCoverPath(storyId, coverPath);
      return coverPath;
    }
    const base64 = await deps.image.generateImage(coverPrompt, {
      aspectRatio: '3:2',
      styleAnchor: artStyleAnchor,
    });
    await deps.storage.uploadImage(coverPath, base64);
    await deps.db.setCoverPath(storyId, coverPath);
    return coverPath;
  };

  // 2-4. Narrative (showdown + aspects) and cover, resuming from the checkpoint.
  let outcome: IBattleOutcome;
  let checklist: ITraitChecklist;
  let rawPages: IPageContent[];
  let coverPath: string;

  if (cp?.outcome && cp?.pages && cp?.checklist) {
    outcome = cp.outcome;
    checklist = cp.checklist;
    rawPages = cp.pages;
    coverPath = await resolveCover();
  } else {
    const isSurpriseEnding = rollForSurpriseEnding();
    const endingType = determineEndingType(isSurpriseEnding);
    const winnerId = isSurpriseEnding ? 'none' : (Math.random() > 0.5 ? 'animalA' : 'animalB');

    await deps.db.updateProgress(storyId, 'Simulating the showdown...', 15);
    const [outcomeData, aspectsA, aspectsB, generatedCover] = await Promise.all([
      deps.llm.getShowdownAndOutcome(
        animalA,
        animalB,
        isSurpriseEnding,
        endingType,
        winnerId,
        visualAnchor,
        fierceMode,
      ),
      deps.llm.getAspectsForAnimal(animalA, ASPECTS, visualAnchor.animalA, fierceMode),
      deps.llm.getAspectsForAnimal(animalB, ASPECTS, visualAnchor.animalB, fierceMode),
      resolveCover(),
    ]);

    outcome = {
      winnerId,
      logicalReasoning: outcomeData.logicalReasoning,
      isSurpriseEnding,
      endingType,
    };
    checklist = outcomeData.checklist;
    coverPath = generatedCover;

    rawPages = [];
    // Combine aspects into page pairs (indices 1–24).
    for (let i = 0; i < 12; i++) {
      const aspectA = aspectsA[i];
      const aspectB = aspectsB[i];

      rawPages.push({
        index: i * 2 + 1,
        title: aspectA.aspectName,
        bodyText: aspectA.bodyText,
        visualPrompt: aspectA.visualPrompt,
        funFact: aspectA.funFact,
        isLeftPage: true,
      });

      rawPages.push({
        index: i * 2 + 2,
        title: '',
        bodyText: aspectB.bodyText,
        visualPrompt: aspectB.visualPrompt,
        funFact: aspectB.funFact,
        isLeftPage: false,
      });
    }

    // Showdown (31) and Outcome (32) pages.
    rawPages.push({
      index: 31,
      title: 'The Showdown',
      bodyText: outcomeData.showdownText.bodyText,
      visualPrompt: outcomeData.showdownText.visualPrompt,
      isLeftPage: true,
    });

    rawPages.push({
      index: 32,
      title: 'Outcome',
      bodyText: outcomeData.outcomeText.bodyText,
      visualPrompt: outcomeData.outcomeText.visualPrompt,
      isLeftPage: false,
    });

    await deps.db.saveManifest(storyId, { outcome, checklist, pages: rawPages });
  }

  // 5. Generate page images (skip-if-exists), bounded for the OpenAI path.
  await deps.db.updateProgress(storyId, 'Illustrating pages...', 25);
  const limit = pLimit(2);
  let completed = 0;
  const total = rawPages.length;
  const finalPages = await Promise.all(
    rawPages.map((page) =>
      limit(async () => {
        const pagePath = `stories/${storyId}/${page.index}.png`;
        if (!(await deps.storage.imageExists(pagePath))) {
          if (completed > 0) {
            await timers.sleep(INTER_REQUEST_DELAY_MS);
          }
          const base64 = await deps.image.generateImage(page.visualPrompt, {
            aspectRatio: '4:3',
            styleAnchor: artStyleAnchor,
          });
          await deps.storage.uploadImage(pagePath, base64);
        }
        completed++;
        await deps.db.updateProgress(
          storyId,
          `Illustrating page ${completed} of ${total}...`,
          Math.round(25 + (completed / total) * 70),
        );
        return { ...page, imageUrl: pagePath };
      }),
    ),
  );

  // 6. Assemble the manifest (Storage paths in image fields, never base64).
  await deps.db.updateProgress(storyId, 'Saving your story...', 98);

  const manifest: IStoryManifest = {
    metadata: {
      id: crypto.randomUUID(),
      title: `Who Would Win? ${animalAQuery} vs. ${animalBQuery}`,
      createdAt: Date.now(),
      hasBeenRead: false,
    },
    animalA,
    animalB,
    coverImageUrl: coverPath,
    checklist,
    outcome,
    pages: finalPages,
    visualAnchor,
  };

  return manifest;
}
