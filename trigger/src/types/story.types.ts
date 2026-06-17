// Duplicated from apex/src/types/story.types.ts — keep in sync.
// Image fields (`coverImageUrl`, `IPageContent.imageUrl`) now hold Supabase Storage paths, not base64.

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
 * Canonical, normalized generation progress. The pipeline owns the phase and the
 * page/total during illustration; the client owns the display copy and percent.
 * Terminal states live on the row `status` ('ready' | 'failed'), not here.
 * Keep this structurally identical to the copy in apex/src/types/story.types.ts.
 */
export type StoryProgress =
  | { phase: 'queued' }
  | { phase: 'researching' }
  | { phase: 'designing' }
  | { phase: 'simulating' }
  | { phase: 'illustrating'; page: number; total: number }
  | { phase: 'binding' };
