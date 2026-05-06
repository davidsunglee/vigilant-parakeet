import pLimit from 'p-limit';
import type { AiConfig } from '../contexts/AiConfigContext';
import { IStoryManifest, IBattleOutcome, IAnimalEntity, IPageContent } from '../types/story.types';
import {
    FIERCE_MODE_DESCRIPTOR,
    StoryGeneratorOptions,
    getArtStyleDescriptor,
} from '../types/artStyle';
import { LlmService } from './LlmService';
import { ImageService } from './ImageService';

type ProgressCallback = (step: string, pct: number) => void;

const DEFAULT_OPTIONS: StoryGeneratorOptions = { artStyle: 'surprise', fierceMode: false };

export class StoryGeneratorService {
    static async generateStory(
        config: AiConfig,
        animalAQuery: string,
        animalBQuery: string,
        options: StoryGeneratorOptions = DEFAULT_OPTIONS,
        onProgress?: ProgressCallback,
    ): Promise<IStoryManifest> {
        const fixedArtStyle = getArtStyleDescriptor(options.artStyle);
        const fierceMode = options.fierceMode;
        // 1. Fetch Biology Profiles
        onProgress?.('Researching animal profiles...', 5);
        const [profileA, profileB] = await Promise.all([
            LlmService.getAnimalProfile(config, animalAQuery),
            LlmService.getAnimalProfile(config, animalBQuery)
        ]);

        const animalA: IAnimalEntity = { id: 'animalA', commonName: animalAQuery, ...profileA };
        const animalB: IAnimalEntity = { id: 'animalB', commonName: animalBQuery, ...profileB };

        // 1b. Generate canonical visual descriptions for consistent imagery
        onProgress?.('Designing animal illustrations...', 10);
        const visualAnchor = await LlmService.getAnimalVisualDescriptions(config, animalA, animalB, {
            fixedArtStyle,
            fierceMode,
        });
        const fierceClause = fierceMode ? ` ${FIERCE_MODE_DESCRIPTOR}` : '';
        const artStyleAnchor = `Generate an illustration in the following style: ${visualAnchor.animalA.artStyle}.${fierceClause} This is a children's educational book illustration.`;

        // 2. Determine Outcome Type internally
        const isSurpriseEnding = this.rollForSurpriseEnding();
        const endingType = this.determineEndingType(isSurpriseEnding);
        const winnerId = isSurpriseEnding ? 'none' : (Math.random() > 0.5 ? 'animalA' : 'animalB');

        const aspects = [
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
            'Overall Threat Level'
        ];

        // 3. Run showdown, both aspects, AND cover image in parallel
        onProgress?.('Simulating the showdown...', 15);
        const coverPrompt = `A dramatic, dynamic children's book cover illustration showing a ${animalAQuery} and a ${animalBQuery} facing each other in an epic standoff. Both animals must be fully visible from head to tail. The scene should be intense and exciting, with both animals looking powerful and ready for battle. Bold, vibrant colors with an action-packed composition. No text in the image.

Animal A: ${visualAnchor.animalA.fullDescription}
Animal B: ${visualAnchor.animalB.fullDescription}`;

        const [outcomeData, aspectsA, aspectsB, coverImageUrl] = await Promise.all([
            LlmService.getShowdownAndOutcome(
                config,
                animalA,
                animalB,
                isSurpriseEnding,
                endingType,
                winnerId,
                visualAnchor,
                fierceMode,
            ),
            LlmService.getAspectsForAnimal(config, animalA, aspects, visualAnchor.animalA, fierceMode),
            LlmService.getAspectsForAnimal(config, animalB, aspects, visualAnchor.animalB, fierceMode),
            ImageService.generateImage(config, coverPrompt, { aspectRatio: '3:2', styleAnchor: artStyleAnchor }),
        ]);

        const outcome: IBattleOutcome = {
            winnerId,
            logicalReasoning: outcomeData.logicalReasoning,
            isSurpriseEnding,
            endingType
        };

        // 4. Generate Page Descriptions from LLM
        const rawPages: IPageContent[] = [];

        // Combine aspects into page pairs
        for (let i = 0; i < 12; i++) {
            const aspectA = aspectsA[i];
            const aspectB = aspectsB[i];

            rawPages.push({
                index: i * 2 + 1,
                title: aspectA.aspectName,
                bodyText: aspectA.bodyText,
                visualPrompt: aspectA.visualPrompt,
                funFact: aspectA.funFact,
                isLeftPage: true
            });

            rawPages.push({
                index: i * 2 + 2,
                title: '',
                bodyText: aspectB.bodyText,
                visualPrompt: aspectB.visualPrompt,
                funFact: aspectB.funFact,
                isLeftPage: false
            });
        }

        // Add Showdown and Outcome pages
        rawPages.push({
            index: 31,
            title: 'The Showdown',
            bodyText: outcomeData.showdownText.bodyText,
            visualPrompt: outcomeData.showdownText.visualPrompt,
            isLeftPage: true
        });

        rawPages.push({
            index: 32,
            title: 'Outcome',
            bodyText: outcomeData.outcomeText.bodyText,
            visualPrompt: outcomeData.outcomeText.visualPrompt,
            isLeftPage: false
        });

        // 5. Generate Images with p-limit concurrency limiter
        onProgress?.('Illustrating pages...', 25);
        const concurrency = config.imageProvider === 'openai' ? 2 : 6;
        const interRequestDelay = config.imageProvider === 'openai' ? 15_000 : 0;
        const limit = pLimit(concurrency);
        let completed = 0;
        const total = rawPages.length;
        const finalPages = await Promise.all(
            rawPages.map(p => limit(async () => {
                if (interRequestDelay && completed > 0) {
                    await new Promise(r => setTimeout(r, interRequestDelay));
                }
                const imageUrl = await ImageService.generateImage(config, p.visualPrompt, { aspectRatio: '4:3', styleAnchor: artStyleAnchor });
                completed++;
                onProgress?.(`Illustrating page ${completed} of ${total}...`, 25 + (completed / total) * 70);
                return { ...p, imageUrl };
            }))
        );

        // 6. Save
        onProgress?.('Saving your story...', 98);

        const manifest: IStoryManifest = {
            metadata: {
                id: crypto.randomUUID(),
                title: `Who Would Win? ${animalAQuery} vs. ${animalBQuery}`,
                createdAt: Date.now(),
                hasBeenRead: false
            },
            animalA,
            animalB,
            coverImageUrl,
            checklist: outcomeData.checklist,
            outcome,
            pages: finalPages,
            visualAnchor,
        };

        return manifest;
    }

    private static rollForSurpriseEnding(): boolean {
        const roll = Math.floor(Math.random() * 7) + 1;
        return roll === 7;
    }

    private static determineEndingType(isSurprise: boolean): IBattleOutcome['endingType'] {
        if (!isSurprise) return 'Standard Victory';
        const types: Array<IBattleOutcome['endingType']> = [
            'External Event',
            'Trait-Based Retreat',
            'The Bigger Fish',
            'Mutual Neutrality'
        ];
        return types[Math.floor(Math.random() * types.length)];
    }
}
