import { GoogleGenAI, Type } from '@google/genai';
import { IAnimalEntity, ITraitChecklist } from '../types/story.types';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

function ensureAi() {
    if (!ai) throw new Error("Gemini API Key is missing. Please add VITE_GEMINI_API_KEY to your .env file.");
    return ai;
}

export class LlmService {
    static async getAnimalProfile(animalName: string): Promise<Omit<IAnimalEntity, 'id' | 'commonName'>> {
        const client = ensureAi();
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Provide biological stats and habitat for the animal: ${animalName}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        scientificName: { type: Type.STRING },
                        weight: { type: Type.STRING },
                        length: { type: Type.STRING },
                        speed: { type: Type.STRING },
                        weaponry: { type: Type.STRING },
                        armor: { type: Type.STRING },
                        brainSize: { type: Type.STRING },
                        habitat: { type: Type.STRING }
                    },
                    required: ["scientificName", "weight", "length", "speed", "weaponry", "armor", "brainSize", "habitat"]
                }
            }
        });

        const data = JSON.parse(response.text as string);
        return {
            scientificName: data.scientificName || 'Unknown',
            habitat: data.habitat || 'Unknown',
            stats: {
                weight: data.weight || 'Unknown',
                length: data.length || 'Unknown',
                speed: data.speed || 'Unknown',
                weaponry: data.weaponry || 'Unknown',
                armor: data.armor || 'Unknown',
                brainSize: data.brainSize || 'Unknown'
            }
        };
    }

    static async getAspectsForAnimal(animal: IAnimalEntity, aspects: string[]) {
        const client = ensureAi();
        const response = await client.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: `Write an engaging, educational children's book page (about 2-3 sentences max) for each of the provided aspects for the animal: ${animal.commonName}. Provide a highly descriptive visual prompt for an image for the page. Generate exactly one array item for each aspect provided, strictly in the same order. Aspects: \n\n${aspects.join('\n')}`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    description: "Array of aspects matching the provided list in order",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            aspectName: { type: Type.STRING },
                            bodyText: { type: Type.STRING },
                            visualPrompt: { type: Type.STRING }
                        },
                        required: ["aspectName", "bodyText", "visualPrompt"]
                    }
                }
            }
        });

        return JSON.parse(response.text as string) as Array<{ aspectName: string, bodyText: string, visualPrompt: string }>;
    }

    static async getShowdownAndOutcome(
        animalA: IAnimalEntity,
        animalB: IAnimalEntity,
        isSurpriseEnding: boolean,
        endingType: string,
        winnerId: string
    ) {
        const client = ensureAi();
        const winnerName = winnerId === 'animalA' ? animalA.commonName : (winnerId === 'animalB' ? animalB.commonName : 'Neither');
        const prompt = `Two animals are facing off: ${animalA.commonName} and ${animalB.commonName}.
        
They will be compared on Speed, Strength, Intelligence, and Armor. Determine who has the advantage for each.
Then, write a logical reasoning for the outcome of the battle.
The determined winner is: ${winnerName}.
Is it a surprise ending? ${isSurpriseEnding}. If yes, the ending type is: ${endingType}.

Provide the checklist advantages, the logical reasoning, and then provide the body text and visual prompt for the "Showdown" page (right before the fight) and the "Outcome" page (the result of the fight). Keep body texts engaging for children (2-3 sentences max).`;

        const response = await client.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        checklistItems: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    traitName: { type: Type.STRING },
                                    animalAAdvantage: { type: Type.BOOLEAN },
                                    animalBAdvantage: { type: Type.BOOLEAN }
                                },
                                required: ["traitName", "animalAAdvantage", "animalBAdvantage"]
                            }
                        },
                        logicalReasoning: { type: Type.STRING },
                        showdownPage: {
                            type: Type.OBJECT,
                            properties: {
                                bodyText: { type: Type.STRING },
                                visualPrompt: { type: Type.STRING }
                            },
                            required: ["bodyText", "visualPrompt"]
                        },
                        outcomePage: {
                            type: Type.OBJECT,
                            properties: {
                                bodyText: { type: Type.STRING },
                                visualPrompt: { type: Type.STRING }
                            },
                            required: ["bodyText", "visualPrompt"]
                        }
                    },
                    required: ["checklistItems", "logicalReasoning", "showdownPage", "outcomePage"]
                }
            }
        });
        const data = JSON.parse(response.text as string);
        return {
            checklist: { items: data.checklistItems } as ITraitChecklist,
            logicalReasoning: data.logicalReasoning as string,
            showdownText: data.showdownPage as { bodyText: string, visualPrompt: string },
            outcomeText: data.outcomePage as { bodyText: string, visualPrompt: string }
        };
    }
}
