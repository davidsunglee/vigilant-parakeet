import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmService } from './LlmService';
import type { AiConfig } from '../contexts/AiConfigContext';

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
    });
});
