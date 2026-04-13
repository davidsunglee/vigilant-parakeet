import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageService } from './ImageService';
import type { AiConfig } from '../contexts/AiConfigContext';

const mockConfig: AiConfig = {
    llmProvider: 'anthropic',
    llmModel: 'claude-3',
    imageProvider: 'gemini',
    imageModel: 'imagen-3',
};

describe('ImageService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('returns the imageDataUri on successful generation', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ imageDataUri: 'data:image/png;base64,abc123' }),
        });

        const result = await ImageService.generateImage(mockConfig, 'A lion in the savannah');
        expect(result).toBe('data:image/png;base64,abc123');
    });

    it('prefixes the prompt with children\'s book styling', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ imageDataUri: 'data:img' }),
        });

        await ImageService.generateImage(mockConfig, 'A tiger roaring');

        const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        expect(body.prompt).toContain("children's educational book style");
        expect(body.prompt).toContain('A tiger roaring');
    });

    it('passes provider and model from config', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ imageDataUri: 'data:img' }),
        });

        await ImageService.generateImage(mockConfig, 'prompt');

        const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        expect(body.provider).toBe('gemini');
        expect(body.model).toBe('imagen-3');
    });

    it('includes optional aspectRatio and resolution when provided', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ imageDataUri: 'data:img' }),
        });

        await ImageService.generateImage(mockConfig, 'prompt', {
            aspectRatio: '16:9',
            resolution: '1024x768',
        });

        const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        expect(body.aspectRatio).toBe('16:9');
        expect(body.resolution).toBe('1024x768');
    });

    it('omits aspectRatio and resolution when not provided', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ imageDataUri: 'data:img' }),
        });

        await ImageService.generateImage(mockConfig, 'prompt');

        const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        expect(body).not.toHaveProperty('aspectRatio');
        expect(body).not.toHaveProperty('resolution');
    });

    it('returns empty string on HTTP error with JSON body', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: () => Promise.resolve({ error: 'Rate limited' }),
        });

        const result = await ImageService.generateImage(mockConfig, 'prompt');
        expect(result).toBe('');
    });

    it('returns empty string on HTTP error with non-JSON body', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Server Error',
            json: () => Promise.reject(new Error('not json')),
        });

        const result = await ImageService.generateImage(mockConfig, 'prompt');
        expect(result).toBe('');
    });

    it('returns empty string on network error', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

        const result = await ImageService.generateImage(mockConfig, 'prompt');
        expect(result).toBe('');
    });

    it('returns empty string when imageDataUri is missing from response', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({}),
        });

        const result = await ImageService.generateImage(mockConfig, 'prompt');
        expect(result).toBe('');
    });

    it('uses styleAnchor instead of generic prefix when provided', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ imageDataUri: 'data:img' }),
        });

        await ImageService.generateImage(mockConfig, 'A lion roaring', {
            styleAnchor: "Soft watercolor children's book illustration style.",
        });

        const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        expect(body.prompt).toContain("Soft watercolor children's book illustration style.");
        expect(body.prompt).not.toContain("children's educational book style");
    });

    it('uses generic children\'s book prefix when styleAnchor is not provided', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ imageDataUri: 'data:img' }),
        });

        await ImageService.generateImage(mockConfig, 'A lion roaring');

        const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        expect(body.prompt).toContain("children's educational book style");
    });

    // Retry logic tests
    describe('retry logic', () => {
        it('retries on 429 status with exponential backoff', async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true });

            const fetchMock = vi.fn()
                .mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    statusText: 'Too Many Requests',
                    json: () => Promise.resolve({ error: 'Rate limited' }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ imageDataUri: 'data:image/png;base64,success' }),
                });

            global.fetch = fetchMock;

            const result = await ImageService.generateImage(mockConfig, 'prompt');

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(result).toBe('data:image/png;base64,success');

            vi.useRealTimers();
        });

        it('retries on network error with exponential backoff', async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true });

            const fetchMock = vi.fn()
                .mockRejectedValueOnce(new Error('Network failure'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ imageDataUri: 'data:image/png;base64,recovered' }),
                });

            global.fetch = fetchMock;

            const result = await ImageService.generateImage(mockConfig, 'prompt');

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(result).toBe('data:image/png;base64,recovered');

            vi.useRealTimers();
        });

        it('returns empty string after exhausting all retries on 429', async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true });

            const fetchMock = vi.fn().mockResolvedValue({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                json: () => Promise.resolve({ error: 'Rate limited' }),
            });

            global.fetch = fetchMock;

            const result = await ImageService.generateImage(mockConfig, 'prompt', undefined, 3);

            // Should retry twice (attempts 0 and 1), then fail on attempt 2 (last attempt, no retry)
            expect(fetchMock).toHaveBeenCalledTimes(3);
            expect(result).toBe('');

            vi.useRealTimers();
        });

        it('returns empty string after exhausting all retries on network errors', async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true });

            const fetchMock = vi.fn().mockRejectedValue(new Error('Network failure'));

            global.fetch = fetchMock;

            const result = await ImageService.generateImage(mockConfig, 'prompt', undefined, 3);

            expect(fetchMock).toHaveBeenCalledTimes(3);
            expect(result).toBe('');

            vi.useRealTimers();
        });

        it('does not retry on non-429 HTTP errors', async () => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                json: () => Promise.resolve({ error: 'Server Error' }),
            });

            global.fetch = fetchMock;

            const result = await ImageService.generateImage(mockConfig, 'prompt');

            // Should not retry on 500 - returns immediately
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(result).toBe('');
        });

        it('respects custom retry count', async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true });

            const fetchMock = vi.fn().mockRejectedValue(new Error('Network failure'));

            global.fetch = fetchMock;

            const result = await ImageService.generateImage(mockConfig, 'prompt', undefined, 2);

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(result).toBe('');

            vi.useRealTimers();
        });

        it('succeeds on the last retry attempt', async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true });

            const fetchMock = vi.fn()
                .mockRejectedValueOnce(new Error('fail 1'))
                .mockRejectedValueOnce(new Error('fail 2'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ imageDataUri: 'data:image/png;base64,finally' }),
                });

            global.fetch = fetchMock;

            const result = await ImageService.generateImage(mockConfig, 'prompt', undefined, 3);

            expect(fetchMock).toHaveBeenCalledTimes(3);
            expect(result).toBe('data:image/png;base64,finally');

            vi.useRealTimers();
        });
    });
});
