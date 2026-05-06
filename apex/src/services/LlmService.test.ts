import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmService } from './LlmService';
import type { AiConfig } from '../contexts/AiConfigContext';
import type { IAnimalVisualDescription, IStoryVisualAnchor } from '../types/story.types';

const mockConfig: AiConfig = {
    llmProvider: 'anthropic',
    llmModel: 'claude-3',
    imageProvider: 'gemini',
    imageModel: 'imagen-3',
};

function mockFetchSuccess(data: unknown) {
    return vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data }),
    });
}

function mockFetchHttpError(status: number, errorBody?: { error: string }) {
    return vi.fn().mockResolvedValue({
        ok: false,
        status,
        statusText: 'Internal Server Error',
        json: errorBody
            ? () => Promise.resolve(errorBody)
            : () => Promise.reject(new Error('not json')),
    });
}

describe('LlmService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // ── callLlm (tested indirectly) ──────────────────────────────────

    describe('callLlm (via public methods)', () => {
        it('sends a POST to /api/llm/generate with correct payload', async () => {
            const profileData = {
                scientificName: 'Panthera leo',
                weight: '190 kg',
                length: '2.5 m',
                speed: '80 km/h',
                weaponry: 'Claws & teeth',
                armor: 'Thick mane',
                brainSize: 'Large',
                habitat: 'Savannah',
            };
            global.fetch = mockFetchSuccess(profileData);

            await LlmService.getAnimalProfile(mockConfig, 'Lion');

            expect(fetch).toHaveBeenCalledOnce();
            const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(url).toBe('/api/llm/generate');
            expect(opts.method).toBe('POST');
            expect(opts.headers['Content-Type']).toBe('application/json');

            const body = JSON.parse(opts.body);
            expect(body.provider).toBe('anthropic');
            expect(body.model).toBe('claude-3');
            expect(body.prompt).toContain('Lion');
            expect(body.responseSchema).toBeDefined();
        });

        it('returns body.data from a successful response', async () => {
            const profileData = {
                scientificName: 'Panthera leo',
                weight: '190 kg',
                length: '2.5 m',
                speed: '80 km/h',
                weaponry: 'Claws',
                armor: 'Mane',
                brainSize: 'Large',
                habitat: 'Savannah',
            };
            global.fetch = mockFetchSuccess(profileData);

            const result = await LlmService.getAnimalProfile(mockConfig, 'Lion');
            expect(result.scientificName).toBe('Panthera leo');
        });

        it('throws with error message from JSON error body on HTTP failure', async () => {
            global.fetch = mockFetchHttpError(500, { error: 'Model overloaded' });

            await expect(LlmService.getAnimalProfile(mockConfig, 'Lion'))
                .rejects.toThrow('Model overloaded');
        });

        it('throws with statusText fallback when error body is not JSON', async () => {
            global.fetch = mockFetchHttpError(500);

            await expect(LlmService.getAnimalProfile(mockConfig, 'Lion'))
                .rejects.toThrow('Internal Server Error');
        });
    });

    // ── getAnimalProfile ─────────────────────────────────────────────

    describe('getAnimalProfile', () => {
        it('returns a correctly shaped profile on happy path', async () => {
            const data = {
                scientificName: 'Ursus arctos',
                weight: '300 kg',
                length: '2.4 m',
                speed: '56 km/h',
                weaponry: 'Claws',
                armor: 'Thick fur',
                brainSize: 'Medium',
                habitat: 'Forests',
            };
            global.fetch = mockFetchSuccess(data);

            const result = await LlmService.getAnimalProfile(mockConfig, 'Bear');

            expect(result).toEqual({
                scientificName: 'Ursus arctos',
                habitat: 'Forests',
                stats: {
                    weight: '300 kg',
                    length: '2.4 m',
                    speed: '56 km/h',
                    weaponry: 'Claws',
                    armor: 'Thick fur',
                    brainSize: 'Medium',
                },
            });
        });

        it('falls back to "Unknown" for missing fields', async () => {
            const data = {
                scientificName: '',
                weight: '',
                length: '',
                speed: '',
                weaponry: '',
                armor: '',
                brainSize: '',
                habitat: '',
            };
            global.fetch = mockFetchSuccess(data);

            const result = await LlmService.getAnimalProfile(mockConfig, 'Mystery');

            expect(result.scientificName).toBe('Unknown');
            expect(result.habitat).toBe('Unknown');
            expect(result.stats.weight).toBe('Unknown');
            expect(result.stats.length).toBe('Unknown');
            expect(result.stats.speed).toBe('Unknown');
            expect(result.stats.weaponry).toBe('Unknown');
            expect(result.stats.armor).toBe('Unknown');
            expect(result.stats.brainSize).toBe('Unknown');
        });

        it('includes the animal name in the prompt', async () => {
            global.fetch = mockFetchSuccess({
                scientificName: 'X', weight: 'X', length: 'X',
                speed: 'X', weaponry: 'X', armor: 'X', brainSize: 'X', habitat: 'X',
            });

            await LlmService.getAnimalProfile(mockConfig, 'Eagle');

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('Eagle');
        });

        it('sends the correct response schema with required fields', async () => {
            global.fetch = mockFetchSuccess({
                scientificName: 'X', weight: 'X', length: 'X',
                speed: 'X', weaponry: 'X', armor: 'X', brainSize: 'X', habitat: 'X',
            });

            await LlmService.getAnimalProfile(mockConfig, 'Wolf');

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.responseSchema.type).toBe('object');
            expect(body.responseSchema.required).toEqual(
                expect.arrayContaining(['scientificName', 'weight', 'length', 'speed', 'weaponry', 'armor', 'brainSize', 'habitat'])
            );
        });
    });

    // ── getShowdownAndOutcome ────────────────────────────────────────

    describe('getShowdownAndOutcome', () => {
        const animalA = {
            id: 'animalA',
            commonName: 'Lion',
            scientificName: 'Panthera leo',
            habitat: 'Savannah',
            stats: { weight: '190 kg', length: '2.5 m', speed: '80 km/h' },
        };
        const animalB = {
            id: 'animalB',
            commonName: 'Tiger',
            scientificName: 'Panthera tigris',
            habitat: 'Jungle',
            stats: { weight: '220 kg', length: '3.0 m', speed: '65 km/h' },
        };

        const mockReturnData = {
            checklistItems: [
                { traitName: 'Speed', animalAAdvantage: true, animalBAdvantage: false },
            ],
            logicalReasoning: 'The lion is faster.',
            showdownPage: { bodyText: 'They face off!', visualPrompt: 'Two animals staring' },
            outcomePage: { bodyText: 'Lion wins!', visualPrompt: 'Lion victorious' },
        };

        it('returns correctly shaped result on happy path', async () => {
            global.fetch = mockFetchSuccess(mockReturnData);

            const result = await LlmService.getShowdownAndOutcome(
                mockConfig, animalA, animalB, false, 'Standard Victory', 'animalA'
            );

            expect(result).toEqual({
                checklist: { items: mockReturnData.checklistItems },
                logicalReasoning: 'The lion is faster.',
                showdownText: { bodyText: 'They face off!', visualPrompt: 'Two animals staring' },
                outcomeText: { bodyText: 'Lion wins!', visualPrompt: 'Lion victorious' },
            });
        });

        it('uses animalA name when winnerId is "animalA"', async () => {
            global.fetch = mockFetchSuccess(mockReturnData);

            await LlmService.getShowdownAndOutcome(
                mockConfig, animalA, animalB, false, 'Standard Victory', 'animalA'
            );

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('The determined winner is: Lion');
        });

        it('uses animalB name when winnerId is "animalB"', async () => {
            global.fetch = mockFetchSuccess(mockReturnData);

            await LlmService.getShowdownAndOutcome(
                mockConfig, animalA, animalB, false, 'Standard Victory', 'animalB'
            );

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('The determined winner is: Tiger');
        });

        it('uses "Neither" when winnerId is "none"', async () => {
            global.fetch = mockFetchSuccess(mockReturnData);

            await LlmService.getShowdownAndOutcome(
                mockConfig, animalA, animalB, true, 'External Event', 'none'
            );

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('The determined winner is: Neither');
        });

        it('includes surprise ending info in prompt', async () => {
            global.fetch = mockFetchSuccess(mockReturnData);

            await LlmService.getShowdownAndOutcome(
                mockConfig, animalA, animalB, true, 'The Bigger Fish', 'none'
            );

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('Is it a surprise ending? true');
            expect(body.prompt).toContain('The Bigger Fish');
        });

        it('adds Fierce Mode language to the showdown/outcome prompt when fierceMode is true', async () => {
            global.fetch = mockFetchSuccess(mockReturnData);

            await LlmService.getShowdownAndOutcome(
                mockConfig, animalA, animalB, false, 'Standard Victory', 'animalA', undefined, true,
            );

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('Fierce Mode is ON');
            expect(body.prompt.toLowerCase()).toContain('powerful posture');
        });

        it('omits Fierce Mode language when fierceMode is false', async () => {
            global.fetch = mockFetchSuccess(mockReturnData);

            await LlmService.getShowdownAndOutcome(
                mockConfig, animalA, animalB, false, 'Standard Victory', 'animalA',
            );

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).not.toContain('Fierce Mode is ON');
        });

        it('injects both animal descriptions in fixed order when visualAnchor is provided', async () => {
            global.fetch = mockFetchSuccess(mockReturnData);

            const visualAnchor: IStoryVisualAnchor = {
                animalA: {
                    artStyle: 'soft watercolor',
                    speciesDescription: 'adult male African lion',
                    bodyColors: 'golden-tawny fur',
                    markings: 'dark brown mane',
                    faceShape: 'broad square jaw',
                    fullDescription: 'A soft watercolor illustration of an adult male African lion with golden-tawny fur.',
                },
                animalB: {
                    artStyle: 'soft watercolor',
                    speciesDescription: 'adult male Bengal tiger',
                    bodyColors: 'orange fur',
                    markings: 'black stripes',
                    faceShape: 'round face',
                    fullDescription: 'A soft watercolor illustration of an adult male Bengal tiger with orange fur and black stripes.',
                },
            };

            await LlmService.getShowdownAndOutcome(
                mockConfig, animalA, animalB, false, 'Standard Victory', 'animalA', visualAnchor
            );

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('Visual consistency instructions');
            // Both descriptions present
            expect(body.prompt).toContain('A soft watercolor illustration of an adult male African lion with golden-tawny fur.');
            expect(body.prompt).toContain('A soft watercolor illustration of an adult male Bengal tiger with orange fur and black stripes.');
            // Animal A appears before Animal B (fixed order)
            const indexA = body.prompt.indexOf('adult male African lion with golden-tawny fur');
            const indexB = body.prompt.indexOf('adult male Bengal tiger with orange fur');
            expect(indexA).toBeLessThan(indexB);
        });
    });

    // ── getAnimalVisualDescriptions ──────────────────────────────────

    describe('getAnimalVisualDescriptions', () => {
        const animalA = {
            id: 'animalA', commonName: 'Lion', scientificName: 'Panthera leo',
            habitat: 'Savannah', stats: { weight: '190 kg', length: '2.5 m', speed: '80 km/h' },
        };
        const animalB = {
            id: 'animalB', commonName: 'Tiger', scientificName: 'Panthera tigris',
            habitat: 'Jungle', stats: { weight: '220 kg', length: '3.0 m', speed: '65 km/h' },
        };

        const mockVisualData = {
            artStyle: 'soft watercolor',
            animalA: {
                speciesDescription: 'adult male African lion',
                bodyColors: 'golden-tawny fur',
                markings: 'dark brown mane',
                faceShape: 'broad square jaw',
                fullDescription: 'A soft watercolor illustration of an adult male African lion.',
            },
            animalB: {
                speciesDescription: 'adult male Bengal tiger',
                bodyColors: 'orange fur with white underbelly',
                markings: 'black stripes',
                faceShape: 'round face',
                fullDescription: 'A soft watercolor illustration of an adult male Bengal tiger.',
            },
        };

        it('returns correctly shaped IStoryVisualAnchor with artStyle copied to both animals', async () => {
            global.fetch = mockFetchSuccess(mockVisualData);

            const result = await LlmService.getAnimalVisualDescriptions(mockConfig, animalA, animalB);

            expect(result.animalA.artStyle).toBe('soft watercolor');
            expect(result.animalB.artStyle).toBe('soft watercolor');
            expect(result.animalA.speciesDescription).toBe('adult male African lion');
            expect(result.animalB.speciesDescription).toBe('adult male Bengal tiger');
            expect(result.animalA.fullDescription).toBeDefined();
            expect(typeof result.animalA.fullDescription).toBe('string');
            expect(result.animalB.fullDescription).toBeDefined();
            expect(typeof result.animalB.fullDescription).toBe('string');
        });

        it('includes both animal names in the prompt', async () => {
            global.fetch = mockFetchSuccess(mockVisualData);

            await LlmService.getAnimalVisualDescriptions(mockConfig, animalA, animalB);

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('Lion');
            expect(body.prompt).toContain('Tiger');
        });

        it('sends a system prompt for the illustrator persona', async () => {
            global.fetch = mockFetchSuccess(mockVisualData);

            await LlmService.getAnimalVisualDescriptions(mockConfig, animalA, animalB);

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.systemPrompt).toBeDefined();
            expect(body.systemPrompt).toContain('illustrator');
        });

        it('sends response schema with required fields', async () => {
            global.fetch = mockFetchSuccess(mockVisualData);

            await LlmService.getAnimalVisualDescriptions(mockConfig, animalA, animalB);

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.responseSchema.type).toBe('object');
            expect(body.responseSchema.properties).toHaveProperty('artStyle');
            expect(body.responseSchema.properties).toHaveProperty('animalA');
            expect(body.responseSchema.properties).toHaveProperty('animalB');
        });

        it('instructs the LLM to use a fixedArtStyle when provided and overrides returned artStyle', async () => {
            global.fetch = mockFetchSuccess(mockVisualData);

            const result = await LlmService.getAnimalVisualDescriptions(mockConfig, animalA, animalB, {
                fixedArtStyle: 'graphic novel illustration with bold inked outlines',
            });

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('graphic novel illustration with bold inked outlines');
            expect(body.prompt).toContain('Use this exact art style');

            // Result should reflect the fixed style rather than the LLM's returned artStyle
            expect(result.animalA.artStyle).toBe('graphic novel illustration with bold inked outlines');
            expect(result.animalB.artStyle).toBe('graphic novel illustration with bold inked outlines');
        });

        it('lets the LLM pick its own art style when no fixedArtStyle is passed (Surprise Me preserved)', async () => {
            global.fetch = mockFetchSuccess(mockVisualData);

            const result = await LlmService.getAnimalVisualDescriptions(mockConfig, animalA, animalB);

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('Pick ONE specific art style');
            expect(result.animalA.artStyle).toBe('soft watercolor');
        });

        it('adds Fierce Mode language to the prompt when fierceMode is enabled', async () => {
            global.fetch = mockFetchSuccess(mockVisualData);

            await LlmService.getAnimalVisualDescriptions(mockConfig, animalA, animalB, {
                fierceMode: true,
            });

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('Fierce Mode is ON');
            expect(body.prompt.toLowerCase()).toContain('powerful posture');
            // Safety language must explicitly disallow gore/violence so the LLM stays children's-book safe.
            expect(body.prompt.toLowerCase()).toContain('do not include gore');
        });

        it('omits Fierce Mode language when fierceMode is false', async () => {
            global.fetch = mockFetchSuccess(mockVisualData);

            await LlmService.getAnimalVisualDescriptions(mockConfig, animalA, animalB);

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).not.toContain('Fierce Mode is ON');
        });
    });

    // ── getAspectsForAnimal ──────────────────────────────────────────

    describe('getAspectsForAnimal', () => {
        const animal = {
            id: 'animalA',
            commonName: 'Eagle',
            scientificName: 'Aquila chrysaetos',
            habitat: 'Mountains',
            stats: { weight: '6 kg', length: '0.9 m', speed: '320 km/h' },
        };

        const aspects = ['Hunting & Diet', 'Speed & Agility'];

        const mockAspectData = [
            { aspectName: 'Hunting & Diet', bodyText: 'Eagles hunt.', visualPrompt: 'Eagle hunting', funFact: 'Eagles see 8x better than humans.' },
            { aspectName: 'Speed & Agility', bodyText: 'Eagles dive fast.', visualPrompt: 'Eagle diving' },
        ];

        it('returns the array from the LLM response', async () => {
            global.fetch = mockFetchSuccess(mockAspectData);

            const result = await LlmService.getAspectsForAnimal(mockConfig, animal, aspects);

            expect(result).toEqual(mockAspectData);
            expect(result).toHaveLength(2);
        });

        it('includes the animal name and aspects in the prompt', async () => {
            global.fetch = mockFetchSuccess(mockAspectData);

            await LlmService.getAspectsForAnimal(mockConfig, animal, aspects);

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('Eagle');
            expect(body.prompt).toContain('Hunting & Diet');
            expect(body.prompt).toContain('Speed & Agility');
        });

        it('sends an array response schema', async () => {
            global.fetch = mockFetchSuccess(mockAspectData);

            await LlmService.getAspectsForAnimal(mockConfig, animal, aspects);

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.responseSchema.type).toBe('array');
            expect(body.responseSchema.items.type).toBe('object');
            expect(body.responseSchema.items.required).toEqual(
                expect.arrayContaining(['aspectName', 'bodyText', 'visualPrompt'])
            );
        });

        it('injects visual description into the prompt when provided', async () => {
            const mockAspectData = [
                { aspectName: 'Hunting & Diet', bodyText: 'Eagles hunt.', visualPrompt: 'Eagle hunting' },
            ];
            global.fetch = mockFetchSuccess(mockAspectData);

            const visualDescription: IAnimalVisualDescription = {
                artStyle: 'soft watercolor',
                speciesDescription: 'adult golden eagle',
                bodyColors: 'dark brown feathers',
                markings: 'golden nape',
                faceShape: 'sharp hooked beak',
                fullDescription: 'A soft watercolor illustration of an adult golden eagle with dark brown feathers and a golden nape.',
            };

            await LlmService.getAspectsForAnimal(mockConfig, animal, ['Hunting & Diet'], visualDescription);

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('Visual consistency instructions');
            expect(body.prompt).toContain('A soft watercolor illustration of an adult golden eagle with dark brown feathers and a golden nape.');
        });

        it('instructs the LLM to vary pose, action, camera angle, and framing across pages', async () => {
            const mockAspectData = [
                { aspectName: 'Hunting & Diet', bodyText: 'x', visualPrompt: 'y' },
            ];
            global.fetch = mockFetchSuccess(mockAspectData);

            const visualDescription: IAnimalVisualDescription = {
                artStyle: 'soft watercolor',
                speciesDescription: 'adult golden eagle',
                bodyColors: 'dark brown feathers',
                markings: 'golden nape',
                faceShape: 'sharp hooked beak',
                fullDescription: 'desc',
            };

            await LlmService.getAspectsForAnimal(mockConfig, animal, ['Hunting & Diet'], visualDescription);

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('Identity invariants');
            expect(body.prompt).toContain('Scene variety');
            expect(body.prompt.toLowerCase()).toContain('pose');
            expect(body.prompt.toLowerCase()).toContain('camera angle');
            expect(body.prompt.toLowerCase()).toContain('framing');
        });

        it('adds Fierce Mode language to the prompt when fierceMode is true', async () => {
            const mockAspectData = [
                { aspectName: 'Hunting & Diet', bodyText: 'x', visualPrompt: 'y' },
            ];
            global.fetch = mockFetchSuccess(mockAspectData);

            await LlmService.getAspectsForAnimal(mockConfig, animal, ['Hunting & Diet'], undefined, true);

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).toContain('Fierce Mode is ON');
            expect(body.prompt.toLowerCase()).toContain('powerful posture');
        });

        it('does NOT add Fierce Mode language when fierceMode is false', async () => {
            const mockAspectData = [
                { aspectName: 'Hunting & Diet', bodyText: 'x', visualPrompt: 'y' },
            ];
            global.fetch = mockFetchSuccess(mockAspectData);

            await LlmService.getAspectsForAnimal(mockConfig, animal, ['Hunting & Diet']);

            const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            expect(body.prompt).not.toContain('Fierce Mode is ON');
        });
    });
});
