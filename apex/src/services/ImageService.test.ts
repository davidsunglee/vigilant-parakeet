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
});
