# Image Quality & Layout Improvements — Design Spec

**Date:** 2026-03-12
**Status:** Draft

## Problem

1. **Image cropping** — `.generated-image` uses `object-fit: cover` with `max-height: 400px`, which clips the top and bottom of images. Animal heads and tails get cut off.
2. **Wasted page space** — Image and text each get `flex: 1 1 50%`, splitting the page evenly. The text (2–3 sentences) uses a fraction of its half, leaving dead space instead of giving the image more room.
3. **Image quality** — `gemini-2.5-flash-image` is a multimodal model doing image generation as a side job. It has no aspect ratio control, producing unpredictable compositions.

## Solution Overview

Three coordinated changes:

1. **CSS layout** — Natural image sizing with text pinned to the bottom
2. **Image model selection** — Add `gemini-3.1-flash-image-preview` with API-level aspect ratio and resolution control
3. **Prompt improvements** — Composition hints to keep full subjects in frame

## Section 1: Page Layout Changes

### CSS Changes (`BookViewer.css`)

**Remove from `.generated-image`:**
- `height: 100%`
- `max-height: 400px`
- `object-fit: cover`

**Add to `.generated-image`:**
- `width: 100%`
- `height: auto`
- `object-fit: contain`

**Change `.visual-content`:**
- From: `flex: 1` (in CSS) plus inline `flex: 1 1 50%`
- To: `flex: 0 0 auto` — sizes to its content (the image's natural dimensions)

**Change `.text-content`:**
- Add: `margin-top: auto` — pins text block to the bottom of the flex container

### Component Changes (`BookViewer.tsx`)

Remove inline `style={{ flex: '1 1 50%' }}` from both `.visual-content` and `.text-content` divs. The CSS classes handle the layout.

### Result

The image displays at its natural aspect ratio (no cropping). It fills the page width and its height follows naturally. Text floats to the bottom of the page, giving the image maximum breathing room. On the old model (no aspect ratio control), `object-fit: contain` ensures even unpredictable aspect ratios display fully.

## Section 2: Image Model Selection & Aspect Ratio

### Architecture

Both `gemini-2.5-flash-image` and `gemini-3.1-flash-image-preview` use the same `generateContent()` API. One `GeminiImageAdapter` handles both — it reads the model from the request and conditionally passes `imageConfig`.

### Type Changes (`server/src/providers/types.ts`)

Add three optional fields to `ImageRequest`:

```typescript
export interface ImageRequest {
  prompt: string;
  model?: string;        // NEW — e.g., "gemini-3.1-flash-image-preview"
  aspectRatio?: string;  // NEW — e.g., "4:3"
  resolution?: string;   // NEW — e.g., "1K"
}
```

### Adapter Changes (`server/src/providers/gemini-image.ts`)

- Use `request.model ?? DEFAULT_MODEL` instead of hardcoded model
- When `request.aspectRatio` is provided, include `imageConfig` in the Gemini API call:
  ```typescript
  config: {
    responseModalities: ['IMAGE'],
    ...(request.aspectRatio && {
      imageConfig: {
        aspectRatio: request.aspectRatio,
        ...(request.resolution && { imageSize: request.resolution }),
      },
    }),
  }
  ```

### Route Changes (`server/src/routes/image.ts`)

Accept optional `model`, `aspectRatio`, `resolution` in the request body schema. Pass them through to `adapter.generate()`.

### Frontend Config (`apex/src/contexts/AiConfigContext.tsx`)

Add `imageModel?: string` to `AiConfig`:

```typescript
export interface AiConfig {
  llmProvider: string;
  llmModel?: string;
  imageProvider: string;
  imageModel?: string;  // NEW
}
```

### Frontend Service (`apex/src/services/ImageService.ts`)

Pass the new fields in the fetch body:

```typescript
body: JSON.stringify({
  provider: config.imageProvider,
  model: config.imageModel,
  prompt: styledPrompt,
  aspectRatio,
  resolution,
})
```

### Story Generator (`apex/src/services/StoryGeneratorService.ts`)

Pass aspect ratio when calling `ImageService.generateImage()`:
- Page illustrations: `aspectRatio: "4:3"` (landscape, fills page width nicely)
- Cover image: `aspectRatio: "3:2"` (the cover uses `object-fit: cover` as a background, so a wider ratio works well)

These are only sent when the selected model supports `imageConfig` (i.e., `gemini-3.1-flash-image-preview`). For `gemini-2.5-flash-image`, the fields are omitted.

### Dashboard UI

Add an image model dropdown to the Dashboard, mirroring the existing LLM model pattern. Available options: `gemini-2.5-flash-image` and `gemini-3.1-flash-image-preview`.

## Section 3: Prompt Improvements

### Page Image Prompt (`ImageService.ts`)

**Before:**
```
Generate an illustration in a children's educational book style: {prompt}
```

**After:**
```
Generate an illustration in a children's educational book style. Show the full subject in frame with space around it. Do not crop the animal's head, tail, or limbs. Subject: {prompt}
```

### Cover Image Prompt (`StoryGeneratorService.ts`)

**Before:**
```
A dramatic, dynamic children's book cover illustration showing a {animalA} and a {animalB} facing each other in an epic standoff. The scene should be intense and exciting, with both animals looking powerful and ready for battle. Bold, vibrant colors with an action-packed composition. No text in the image.
```

**After:**
```
A dramatic, dynamic children's book cover illustration showing a {animalA} and a {animalB} facing each other in an epic standoff. Both animals must be fully visible from head to tail. The scene should be intense and exciting, with both animals looking powerful and ready for battle. Bold, vibrant colors with an action-packed composition. No text in the image.
```

### Rationale

Defense in depth: even with API aspect ratio control and `object-fit: contain`, the model might compose images with subjects too close to edges. Prompt hints are the first line of defense and the only defense for `gemini-2.5-flash-image` which lacks `imageConfig`.

## Files Changed Summary

| File | Change |
|------|--------|
| `apex/src/components/book/BookViewer.css` | Fix `.generated-image` and `.visual-content` / `.text-content` flex layout |
| `apex/src/components/book/BookViewer.tsx` | Remove inline flex styles from visual/text content divs |
| `apex/src/contexts/AiConfigContext.tsx` | Add `imageModel?` to `AiConfig` |
| `apex/src/services/ImageService.ts` | Pass model/aspectRatio/resolution, improve prompt |
| `apex/src/services/StoryGeneratorService.ts` | Pass aspect ratios, improve cover prompt |
| `apex/src/components/dashboard/Dashboard.tsx` | Add image model dropdown |
| `server/src/providers/types.ts` | Add `model?`, `aspectRatio?`, `resolution?` to `ImageRequest` |
| `server/src/providers/gemini-image.ts` | Use `request.model`, conditionally pass `imageConfig` |
| `server/src/routes/image.ts` | Accept optional model/aspectRatio/resolution in body |

## Out of Scope

- Adding non-Gemini image providers (DALL-E, Stability AI, etc.)
- Imagen API integration (uses a different `generateImages()` method)
- Image caching or retry logic
- Mobile-specific layout adjustments beyond what the existing responsive CSS handles
