import { describe, it, expect, mock, spyOn } from 'bun:test';
import { ImageClient } from '../image';
import type { IImageProvider } from '../../providers/types';

describe('ImageClient.generateImage failure propagation', () => {
  it('throws (does not return empty string) when the adapter fails every retry', async () => {
    const boom = new Error('OpenAI outage');
    const adapter = {
      generate: mock(async () => {
        throw boom;
      }),
    };
    // Silence the expected error log.
    spyOn(console, 'error').mockImplementation(() => {});
    const client = new ImageClient(adapter as unknown as IImageProvider, 'gpt-image-2', 'medium', 'owner-1');

    // retries=1 avoids the exponential backoff wait; the single attempt fails.
    await expect(client.generateImage('a lion roaring', { aspectRatio: '4:3' }, 1)).rejects.toThrow('OpenAI outage');
  });

  it('throws when the adapter returns an empty image payload', async () => {
    const adapter = {
      generate: mock(async () => ({ imageDataUri: '' })),
    };
    const client = new ImageClient(adapter as unknown as IImageProvider, 'gpt-image-2', 'medium', 'owner-1');

    await expect(client.generateImage('a lion roaring', { aspectRatio: '4:3' }, 1)).rejects.toThrow();
  });
});
