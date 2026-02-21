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

export interface IStoryManifest {
  readonly metadata: IStoryMetadata;
  readonly animalA: IAnimalEntity;
  readonly animalB: IAnimalEntity;
  readonly coverImageUrl?: string;  // AI-generated cover image
  readonly pages: IPageContent[]; // Fixed length array (32 pages ideally)
  readonly checklist: ITraitChecklist;
  readonly outcome: IBattleOutcome;
}

// Utility pattern for Prompt Engineering mapping
export type PromptStructure<T> = Record<keyof T, undefined>;
