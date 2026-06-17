export interface IBiologicalStats {
  weight: string;
  length: string;
  speed: string;
  weaponry?: string; // Claws, teeth, venom, etc.
  armor?: string;
  brainSize?: string;
}

export interface IAnimalEntity {
  readonly id: string;
  readonly commonName: string;
  readonly scientificName: string;
  readonly stats: IBiologicalStats;
  readonly habitat: string;
}

export interface IPageContent {
  readonly index: number;
  readonly title: string;
  readonly bodyText: string;
  readonly visualPrompt: string; // Prompt used for the left/right illustration
  readonly imageUrl?: string;    // Base64 or URL for the generated image
  readonly funFact?: string;     // Optional LLM-generated fun fact
  readonly isLeftPage: boolean;
}

export interface IBattleOutcome {
  readonly winnerId: string;
  readonly logicalReasoning: string;
  readonly isSurpriseEnding: boolean;
  readonly endingType: 'Standard Victory' | 'External Event' | 'Trait-Based Retreat' | 'The Bigger Fish' | 'Mutual Neutrality';
}

export interface ITraitChecklistItem {
  readonly traitName: string;
  readonly animalAAdvantage: boolean; // Does animal A win this trait?
  readonly animalBAdvantage: boolean; // Does animal B win this trait?
}

export interface ITraitChecklist {
  readonly items: ITraitChecklistItem[];
}

export interface IStoryMetadata {
  readonly id: string; // UUID
  readonly title: string;
  readonly createdAt: number;
  readonly hasBeenRead: boolean;
}

export interface IAnimalVisualDescription {
  readonly artStyle: string;
  readonly speciesDescription: string;
  readonly bodyColors: string;
  readonly markings: string;
  readonly faceShape: string;
  readonly fullDescription: string;
}

export interface IStoryVisualAnchor {
  readonly animalA: IAnimalVisualDescription;
  readonly animalB: IAnimalVisualDescription;
}

export interface IStoryManifest {
  readonly metadata: IStoryMetadata;
  readonly animalA: IAnimalEntity;
  readonly animalB: IAnimalEntity;
  readonly coverImageUrl?: string;  // AI-generated cover image
  readonly pages: IPageContent[]; // Fixed length array (32 pages ideally)
  readonly checklist: ITraitChecklist;
  readonly outcome: IBattleOutcome;
  readonly visualAnchor?: IStoryVisualAnchor;
}

/**
 * Lightweight manifest that excludes pages and their images.
 * Used by the dashboard to avoid loading multi-MB page data.
 */
export interface IStoryManifestLite {
    metadata: IStoryMetadata;
    animalA: IAnimalEntity;
    animalB: IAnimalEntity;
    coverImageUrl?: string;
    checklist: ITraitChecklist;
    outcome: IBattleOutcome;
    visualAnchor?: IStoryVisualAnchor;
}

// Utility pattern for Prompt Engineering mapping
export type PromptStructure<T> = Record<keyof T, undefined>;

/**
 * Canonical, normalized generation progress stored in `stories.progress`.
 * Keep this structurally identical to the copy in trigger/src/types/story.types.ts.
 */
export type StoryProgress =
  | { phase: 'queued' }
  | { phase: 'researching' }
  | { phase: 'designing' }
  | { phase: 'simulating' }
  | { phase: 'illustrating'; page: number; total: number }
  | { phase: 'binding' };

/**
 * Lifecycle status of a story row in the Postgres `stories` catalog.
 */
export type StoryStatus = 'generating' | 'ready' | 'failed';

/**
 * A `generating` story whose `updated_at` has not advanced within this window is
 * treated as stalled: its Trigger.dev run expired before a worker picked it up,
 * was canceled, or the worker died mid-run, so no progress will ever arrive. The
 * `stories_set_updated_at` trigger bumps `updated_at` on every progress write, so
 * a healthy run refreshes it constantly while a stalled one never does.
 * Keep in sync with the same constant in supabase/functions/retry-story.
 */
export const STALLED_AFTER_MS = 5 * 60 * 1000;

/**
 * Shape of a row in the Supabase `stories` table. Image fields hold Supabase
 * Storage paths (e.g. `stories/{id}/cover.png`), not base64 data URIs; the full
 * page/manifest content lives in the `manifest` JSONB column once generation
 * completes server-side.
 */
export interface StoryRecord {
  id: string;
  owner_id: string;
  status: StoryStatus;
  animal_a: string;
  animal_b: string;
  title: string | null;
  art_style: string;
  fierce_mode: boolean;
  cover_image_path: string | null;
  manifest: IStoryManifest | null;
  progress: StoryProgress | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}
