import type { AiConfig } from '../contexts/AiConfigContext';
import { IAnimalEntity, ITraitChecklist } from '../types/story.types';

async function callLlm(config: AiConfig, prompt: string, responseSchema: object, systemPrompt?: string) {
    const res = await fetch('/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider: config.llmProvider,
            model: config.llmModel,
            prompt,
            systemPrompt,
            responseSchema,
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `LLM request failed: ${res.status}`);
    }

    const body = await res.json();
    return body.data;
}

export class LlmService {
    static async getAnimalProfile(config: AiConfig, animalName: string): Promise<Omit<IAnimalEntity, 'id' | 'commonName'>> {
        const data = await callLlm(config, `Provide biological stats and habitat for the animal: ${animalName}`, {
            type: 'object',
            properties: {
                scientificName: { type: 'string' },
                weight: { type: 'string' },
                length: { type: 'string' },
                speed: { type: 'string' },
                weaponry: { type: 'string' },
                armor: { type: 'string' },
                brainSize: { type: 'string' },
                habitat: { type: 'string' },
            },
            required: ['scientificName', 'weight', 'length', 'speed', 'weaponry', 'armor', 'brainSize', 'habitat'],
        });

        return {
            scientificName: data.scientificName || 'Unknown',
            habitat: data.habitat || 'Unknown',
            stats: {
                weight: data.weight || 'Unknown',
                length: data.length || 'Unknown',
                speed: data.speed || 'Unknown',
                weaponry: data.weaponry || 'Unknown',
                armor: data.armor || 'Unknown',
                brainSize: data.brainSize || 'Unknown',
            },
        };
    }

    static async getAspectsForAnimal(config: AiConfig, animal: IAnimalEntity, aspects: string[]) {
        const data = await callLlm(config, `Write an engaging, educational children's book page (about 2-3 sentences max) for each of the provided aspects for the animal: ${animal.commonName}. Provide a highly descriptive visual prompt for an image for the page.

Fun fact rules:
- Include a fun fact on AT MOST 3 out of the ${aspects.length} pages — pick only the most genuinely surprising and fascinating facts.
- Each fun fact must be a single sentence, different from the main body text, and relevant to that page's specific aspect.
- Spread the fun facts out: place them across early, middle, and late aspects (not clustered together).
- If fewer than 3 facts are truly interesting, include fewer. Do not force any.

Generate exactly one array item for each aspect provided, strictly in the same order. Aspects: \n\n${aspects.join('\n')}`, {
            type: 'array',
            description: 'Array of aspects matching the provided list in order',
            items: {
                type: 'object',
                properties: {
                    aspectName: { type: 'string' },
                    bodyText: { type: 'string' },
                    visualPrompt: { type: 'string' },
                    funFact: { type: 'string', description: 'Optional: a short, surprising fun fact different from bodyText. Omit if nothing genuinely interesting.' },
                },
                required: ['aspectName', 'bodyText', 'visualPrompt'],
            },
        });

        return data as Array<{ aspectName: string; bodyText: string; visualPrompt: string; funFact?: string }>;
    }

    static async getShowdownAndOutcome(
        config: AiConfig,
        animalA: IAnimalEntity,
        animalB: IAnimalEntity,
        isSurpriseEnding: boolean,
        endingType: string,
        winnerId: string
    ) {
        const winnerName = winnerId === 'animalA' ? animalA.commonName : (winnerId === 'animalB' ? animalB.commonName : 'Neither');
        const prompt = `Two animals are facing off: ${animalA.commonName} and ${animalB.commonName}.

They will be compared on Speed, Strength, Intelligence, and Armor. Determine who has the advantage for each.
Then, write a logical reasoning for the outcome of the battle.
The determined winner is: ${winnerName}.
Is it a surprise ending? ${isSurpriseEnding}. If yes, the ending type is: ${endingType}.

Provide the checklist advantages, the logical reasoning, and then provide the body text and visual prompt for the "Showdown" page (right before the fight) and the "Outcome" page (the result of the fight). Keep body texts engaging for children (2-3 sentences max).`;

        const data = await callLlm(config, prompt, {
            type: 'object',
            properties: {
                checklistItems: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            traitName: { type: 'string' },
                            animalAAdvantage: { type: 'boolean' },
                            animalBAdvantage: { type: 'boolean' },
                        },
                        required: ['traitName', 'animalAAdvantage', 'animalBAdvantage'],
                    },
                },
                logicalReasoning: { type: 'string' },
                showdownPage: {
                    type: 'object',
                    properties: {
                        bodyText: { type: 'string' },
                        visualPrompt: { type: 'string' },
                    },
                    required: ['bodyText', 'visualPrompt'],
                },
                outcomePage: {
                    type: 'object',
                    properties: {
                        bodyText: { type: 'string' },
                        visualPrompt: { type: 'string' },
                    },
                    required: ['bodyText', 'visualPrompt'],
                },
            },
            required: ['checklistItems', 'logicalReasoning', 'showdownPage', 'outcomePage'],
        });

        return {
            checklist: { items: data.checklistItems } as ITraitChecklist,
            logicalReasoning: data.logicalReasoning as string,
            showdownText: data.showdownPage as { bodyText: string; visualPrompt: string },
            outcomeText: data.outcomePage as { bodyText: string; visualPrompt: string },
        };
    }
}
