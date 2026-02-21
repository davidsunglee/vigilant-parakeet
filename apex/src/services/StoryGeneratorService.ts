import { v4 as uuidv4 } from 'uuid';
import { IStoryManifest, IBattleOutcome, IAnimalEntity } from '../types/story.types';
import { LlmService } from './LlmService';
import { ImageService } from './ImageService';

export class StoryGeneratorService {
    static async generateStory(animalAQuery: string, animalBQuery: string): Promise<IStoryManifest> {
        // 1. Fetch Biology Profiles
        const [profileA, profileB] = await Promise.all([
            LlmService.getAnimalProfile(animalAQuery),
            LlmService.getAnimalProfile(animalBQuery)
        ]);

        const animalA: IAnimalEntity = { id: 'animalA', commonName: animalAQuery, ...profileA };
        const animalB: IAnimalEntity = { id: 'animalB', commonName: animalBQuery, ...profileB };

        // 2. Determine Outcome Type internally
        const isSurpriseEnding = this.rollForSurpriseEnding();
        const endingType = this.determineEndingType(isSurpriseEnding);
        const winnerId = isSurpriseEnding ? 'none' : (Math.random() > 0.5 ? 'animalA' : 'animalB');

        // 3. Generate Battle Outcome and Checklist from LLM
        const outcomeData = await LlmService.getShowdownAndOutcome(
            animalA,
            animalB,
            isSurpriseEnding,
            endingType,
            winnerId
        );

        const outcome: IBattleOutcome = {
            winnerId,
            logicalReasoning: outcomeData.logicalReasoning,
            isSurpriseEnding,
            endingType
        };

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

        // 4. Generate Page Descriptions from LLM
        const [aspectsA, aspectsB] = await Promise.all([
            LlmService.getAspectsForAnimal(animalA, aspects),
            LlmService.getAspectsForAnimal(animalB, aspects)
        ]);

        const rawPages = [];

        // Combine aspects into page pairs
        for (let i = 0; i < 12; i++) {
            const aspectA = aspectsA[i];
            const aspectB = aspectsB[i];

            rawPages.push({
                index: i * 2 + 1,
                title: aspectA.aspectName,
                bodyText: aspectA.bodyText,
                visualPrompt: aspectA.visualPrompt,
                isLeftPage: true
            });

            rawPages.push({
                index: i * 2 + 2,
                title: '', // Right page inherits title visually or remains blank
                bodyText: aspectB.bodyText,
                visualPrompt: aspectB.visualPrompt,
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

        // 5. Generate Images Concurrently (Chunked to prevent ratelimits)
        const chunkedImageGen = async (pages: any[], chunkSize: number = 4) => {
            const results = [];
            for (let i = 0; i < pages.length; i += chunkSize) {
                const chunk = pages.slice(i, i + chunkSize);
                console.log(`Generating images for chunk ${i / chunkSize + 1}`);
                const chunkResults = await Promise.all(chunk.map(async p => {
                    const imageUrl = await ImageService.generateImage(p.visualPrompt);
                    return { ...p, imageUrl };
                }));
                results.push(...chunkResults);
            }
            return results;
        };

        const finalPages = await chunkedImageGen(rawPages, 4);

        // 6. Generate Cover Image
        console.log('Generating cover image...');
        const coverPrompt = `A dramatic, dynamic children's book cover illustration showing a ${animalAQuery} and a ${animalBQuery} facing each other in an epic standoff. The scene should be intense and exciting, with both animals looking powerful and ready for battle. Bold, vibrant colors with an action-packed composition. No text in the image.`;
        const coverImageUrl = await ImageService.generateImage(coverPrompt);

        const manifest: IStoryManifest = {
            metadata: {
                id: uuidv4(),
                title: `Who Would Win? ${animalAQuery} vs. ${animalBQuery}`,
                createdAt: Date.now(),
                hasBeenRead: false
            },
            animalA,
            animalB,
            coverImageUrl,
            checklist: outcomeData.checklist,
            outcome,
            pages: finalPages
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
