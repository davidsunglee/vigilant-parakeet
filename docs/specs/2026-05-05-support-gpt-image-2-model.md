# Support for the gpt-image-2 image-generation model

## Goal

Add OpenAI's `gpt-image-2` as a selectable image-generation model in the existing OpenAI image provider, and make it the new default. The model must only be available for image generation — it must not appear as an option for LLM / text generation anywhere in the codebase.

## Context

- The server already has an OpenAI image adapter at `server/src/providers/openai-image.ts`. Today it defaults to `gpt-image-1` and supports `dall-e-3` as a second option (via `model.startsWith('dall-e')` branching).
- The adapter's `mapAspectRatioToSize` uses two maps: `GPT_IMAGE_SIZES` for non-DALL-E models (entries `1024x1024`, `1536x1024`, `1024x1536`; falls back to `auto`) and `DALLE_SIZES` for DALL-E models.
- The request body branches on the same DALL-E check: non-DALL-E models pass `output_format: 'png'`; DALL-E passes `response_format: 'b64_json'`. Both response paths read `response.data[0].b64_json`.
- The frontend selects models via the `IMAGE_MODELS` dictionary in `apex/src/components/dashboard/Dashboard.tsx:23-32`. The `openai` entry currently lists `gpt-image-1` (shown first / acts as default) and `dall-e-3`. The dropdown is rendered inside Advanced Options on the Dashboard.
- LLM / text models are surfaced via a separate UI path (`config.llmProvider` / `config.llmModel` in `AiConfigContext`) and have no shared model dictionary with image models — so image-only is naturally enforced as long as `gpt-image-2` is added to `IMAGE_MODELS` and not to any LLM surface.
- External verification (OpenAI developer docs via Context7) confirms `gpt-image-2`:
  - Accepts the same three size strings the existing `GPT_IMAGE_SIZES` map produces (`1024x1024`, `1536x1024`, `1024x1536`) plus `auto`. It additionally supports higher resolutions (2K, 4K) that are out of scope here.
  - Uses the identical `openai.images.generate({ model, prompt, size, ... })` call shape as `gpt-image-1`, including `output_format: 'png'` and the `b64_json` response field.
  - Does not support `background: "transparent"` (the API errors). The current code does not pass a `background` parameter, so this is a non-regression boundary.

## Requirements

- Change `DEFAULT_MODEL` in `server/src/providers/openai-image.ts` from `'gpt-image-1'` to `'gpt-image-2'` so requests to `/api/image/generate` with `provider: 'openai'` and no `model` field route to `gpt-image-2`.
- Add `gpt-image-2` to the `openai` entry of `IMAGE_MODELS` in `apex/src/components/dashboard/Dashboard.tsx`. Place it first so it is the default selection in the dropdown; use a label consistent with the existing convention (`GPT Image 2`).
- Keep `gpt-image-1` and `dall-e-3` selectable in the same dropdown for users who want to pin to either.
- `gpt-image-2` must not appear in any LLM model list, dropdown, default, or test fixture — image-only.
- Update `server/src/providers/__tests__/openai-image.test.ts` so the existing default-model assertion (currently expects `'gpt-image-1'`) is updated to expect `'gpt-image-2'`, and add coverage that `gpt-image-2` resolves through the same size map and `output_format: 'png'` branch as `gpt-image-1`.

## Constraints

- Reuse the existing `GPT_IMAGE_SIZES` map as-is. Do not add a `gpt-image-2`-specific size dictionary or new aspect-ratio entries.
- Reuse the existing `model.startsWith('dall-e')` branch as-is. Do not introduce a third request-shape branch for `gpt-image-2`.
- Do not pass a `background` parameter for `gpt-image-2` (the model rejects `transparent`). The existing code already does not pass `background`, so this is a stay-the-course constraint, not a code change.
- Do not change the OpenAI LLM adapter (`server/src/providers/openai-llm.ts`) or any LLM route — `gpt-image-2` is image-only.
- Do not change the DALL-E size map or DALL-E request branching.

## Acceptance Criteria

- With `OPENAI_API_KEY` set, opening the Dashboard's Advanced Options and selecting the OpenAI image provider shows three models in the model dropdown: `gpt-image-2` (selected by default), `gpt-image-1`, and `dall-e-3`.
- Generating a story with OpenAI as the image provider and no explicit `imageModel` chosen results in the OpenAI SDK being called with `model: 'gpt-image-2'`.
- Generating with `gpt-image-1` or `dall-e-3` explicitly selected continues to call the SDK with that exact model string and the existing size / output-format mapping (no regressions).
- All existing tests in `openai-image.test.ts` for `gpt-image-1` and `dall-e-3` continue to pass; the default-model test now asserts `'gpt-image-2'`.
- New tests in `openai-image.test.ts` cover: (a) `gpt-image-2` is the default when `request.model` is absent, (b) `gpt-image-2` resolves aspect ratios through `GPT_IMAGE_SIZES` (e.g. `4:3 → 1536x1024`, `undefined → auto`), and (c) `gpt-image-2` requests pass `output_format: 'png'`, not `response_format: 'b64_json'`.
- No LLM provider/model UI surface or test fixture references `gpt-image-2`.

## Non-Goals

- Exposing `gpt-image-2`'s higher resolutions (2K, 4K). The aspect-ratio map stays capped at 1536×1024.
- Supporting transparent backgrounds (`background: "transparent"`) for any image model. `gpt-image-2` rejects it; current code does not pass it.
- Adding any new image-generation parameters (`quality`, `partial_images`, streaming, `output_compression`, etc.).
- Refactoring the `model.startsWith('dall-e')` branch into a more general dispatcher.
- Adding `gpt-image-2` to any LLM / text-generation code path or model list.
- Updating user-facing documentation (`README.md`, `apex/README.md`) — neither file enumerates the OpenAI image-model lineup today.
