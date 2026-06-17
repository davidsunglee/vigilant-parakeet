import { task } from '@trigger.dev/sdk';
import { AnthropicLlmAdapter } from '../providers/anthropic-llm';
import { OpenAiImageAdapter } from '../providers/openai-image';
import type { ImageRequest } from '../providers/types';
import { LlmClient } from '../lib/llm';
import { ImageClient } from '../lib/image';
import {
  runGenerationPipeline,
  type GenerateStoryPayload,
  type PipelineDeps,
} from '../lib/pipeline';
import { createServiceClient } from '../lib/supabase';
import { uploadImage, imageExists } from '../lib/storage';
import {
  loadCheckpoint,
  updateProgress,
  saveManifest,
  setCoverPath,
  finalize,
  fail,
} from '../lib/db';

/** Per-request model + quality selection, chosen server-side (never by the client). */
export interface GenerationConfig {
  textModel: string;
  imageModel: string;
  // Reuses the provider's image quality union as the single source of truth so
  // the discrete levels aren't re-spelled here.
  imageQuality: NonNullable<ImageRequest['quality']>;
}

// Must match `retry.maxAttempts` below; used to detect the terminal attempt so
// only an exhausted run records the `failed` state.
const MAX_ATTEMPTS = 3;

// Default model/quality if the trigger payload omits or partially fills config.
const DEFAULT_TEXT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
const DEFAULT_IMAGE_QUALITY: GenerationConfig['imageQuality'] = 'medium';

export const generateStory = task({
  id: "generate-story",
  // Full story generation includes 27 image calls; local smoke runs have shown
  // shorter timeouts are too tight for OpenAI image generation.
  maxDuration: 1500,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  run: async (
    payload: GenerateStoryPayload & { generationConfig?: Partial<GenerationConfig> },
    { ctx },
  ) => {
    // Step 7: apply defaults for an absent or partial generationConfig.
    const generationConfig: GenerationConfig = {
      textModel: payload.generationConfig?.textModel ?? DEFAULT_TEXT_MODEL,
      imageModel: payload.generationConfig?.imageModel ?? DEFAULT_IMAGE_MODEL,
      imageQuality: payload.generationConfig?.imageQuality ?? DEFAULT_IMAGE_QUALITY,
    };

    // Provider keys come from the Trigger.dev environment, never the client.
    const client = createServiceClient();
    const llm = new LlmClient(
      new AnthropicLlmAdapter(process.env.ANTHROPIC_API_KEY!),
      generationConfig.textModel,
      payload.ownerId,
    );
    const image = new ImageClient(
      new OpenAiImageAdapter(process.env.OPENAI_API_KEY!),
      generationConfig.imageModel,
      generationConfig.imageQuality,
      payload.ownerId,
    );

    // Bind the Storage/DB helpers to the service client for the pure pipeline.
    const deps: PipelineDeps = {
      llm,
      image,
      storage: {
        uploadImage: (path, base64) => uploadImage(client, path, base64),
        imageExists: (path) => imageExists(client, path),
      },
      db: {
        loadCheckpoint: (storyId) => loadCheckpoint(client, storyId),
        updateProgress: (storyId, progress) => updateProgress(client, storyId, progress),
        saveManifest: (storyId, manifest) => saveManifest(client, storyId, manifest),
        setCoverPath: (storyId, path) => setCoverPath(client, storyId, path),
      },
    };

    try {
      const manifest = await runGenerationPipeline(deps, payload);
      await finalize(client, payload.storyId, manifest, manifest.metadata.title);
      return manifest;
    } catch (err) {
      // Non-goal: no user-facing manual retry in this slice. Transient failures
      // keep retrying (the error is rethrown to let Trigger.dev schedule the
      // next attempt); only the final exhausted attempt records the terminal
      // `failed` state so progress is not clobbered mid-retry.
      if (ctx.attempt.number >= MAX_ATTEMPTS) {
        const message = err instanceof Error ? err.message : String(err);
        await fail(client, payload.storyId, message);
      }
      throw err;
    }
  },
});
