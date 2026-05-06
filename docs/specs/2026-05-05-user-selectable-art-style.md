# User-selectable art style and visual intensity for generated stories

Source: TODO-5653cb62

## Goal

Let the user choose the art style of their generated storybook from a curated list of presets, with a "Surprise Me" default that preserves today's LLM-picks-the-style behavior. Also let the user optionally enable a visual-only "Fierce Mode" that makes the animals look more intense while staying appropriate for a children's educational book. The chosen visual treatment must apply consistently across the entire book — every interior page **and** the cover — while preserving animal identity without making page imagery feel overly same-same.

## Context

- Today the LLM picks the art style automatically inside `LlmService.getAnimalVisualDescriptions` (`apex/src/services/LlmService.ts`). The prompt instructs it to "Pick ONE specific art style (e.g., 'soft watercolor', 'bold digital cartoon', 'colored pencil sketch') that will be used consistently for BOTH animals throughout the book." The chosen string lands in `IAnimalVisualDescription.artStyle` and is also embedded in `fullDescription`.
- The current consistency mechanism is prompt-only. The app does **not** generate a first image, inspect it, extract salient physical features, and feed those features into subsequent prompts. Instead, an LLM-generated visual anchor captures physical traits and style before any page images are generated.
- The art style flows to interior page images via two paths:
  1. `fullDescription` is prepended to every per-page `visualPrompt` produced by `LlmService.getAspectsForAnimal` and `LlmService.getShowdownAndOutcome` (the LLM is told to begin every visualPrompt with the canonical anchor).
  2. `StoryGeneratorService` constructs an `artStyleAnchor` from `visualAnchor.animalA.artStyle` and passes it as `options.styleAnchor` to `ImageService.generateImage` for every page.
- This prompt-only anchor is successfully keeping physical traits consistent, but it can make images feel too similar across pages: pose, viewing angle, framing, animal placement, and action can repeat because every prompt starts from nearly the same canonical description.
- The **cover** is built differently. `StoryGeneratorService` constructs a hardcoded "dramatic, dynamic children's book cover illustration … bold, vibrant colors with an action-packed composition" prompt and calls `ImageService.generateImage(config, coverPrompt, { aspectRatio: '3:2' })` — note the absence of `styleAnchor`. So today the cover renders in whatever style the image model defaults to for that prompt, decoupled from the rest of the book.
- The Dashboard form (`apex/src/components/dashboard/Dashboard.tsx`) consists of Animal A / Animal B text inputs, a Generate button, and a collapsible "Advanced Options" `<details>` containing LLM provider, image provider, and image model dropdowns. There is no art-style control or visual-intensity control today.
- `IStoryManifest.visualAnchor` (defined in `apex/src/types/story.types.ts`) already persists `IAnimalVisualDescription.artStyle` per animal, so persistence of the chosen style is already covered by the existing data model.

## Requirements

- Add a top-level art-style picker to the Dashboard generator form, visible by default — not hidden inside Advanced Options. It sits adjacent to the Animal A / Animal B inputs (e.g., directly below them) so it reads as part of the primary creation flow.
- The picker is a single-select with exactly these six options, in this order:
  1. **Surprise Me** *(selected by default)*
  2. **Watercolor**
  3. **Colored Pencil Sketch**
  4. **Storybook Painterly**
  5. **Graphic Novel**
  6. **3D Animated**
- Each non-"Surprise Me" preset maps to a concrete style descriptor string that is rich enough to produce visibly distinct image-model output (e.g., "soft watercolor illustration with loose brushstrokes and gentle washes" rather than just "watercolor"). The descriptor is what flows into prompts, not the human-readable label.
- Add **Fierce Mode** as an Advanced Options control, default off. It is orthogonal to the art-style picker: any art style, including "Surprise Me", can be generated with Fierce Mode on or off.
- When Fierce Mode is enabled, animal image prompts emphasize children's-book-appropriate intensity: powerful posture, alert expression, dynamic energy, dramatic but safe presence. Fierce Mode must not introduce gore, injury, blood, horror, realistic violence, or anything outside a children's educational book tone.
- Fierce Mode is visual-only. It must affect generated image prompts for the cover and all page images, but it must not make the story text more violent, alter the battle outcome logic, change educational facts, or affect surprise-ending behavior.
- The user's art-style choice is passed through `StoryGeneratorService.generateStory(...)` into `LlmService.getAnimalVisualDescriptions(...)`. When a specific preset is chosen, the LLM is instructed to use **that** style for both animals (and only fill in `speciesDescription`, `bodyColors`, `markings`, `faceShape`, `fullDescription`); when "Surprise Me" is chosen, the LLM picks the style as it does today.
- The user's Fierce Mode choice is passed through the same generation flow as a per-generation visual parameter. When enabled, it layers on top of the selected or surprise art style rather than replacing it.
- The cover image must render with the same art style and Fierce Mode treatment as the rest of the book in **all** cases. The existing "dramatic, dynamic standoff … bold, vibrant colors, action-packed composition" framing remains and layers on top of the chosen medium and optional fierce visual treatment.
- The chosen style and Fierce Mode setting must apply consistently across all 26 interior pages and the cover within a single generated story. There is no per-page or per-animal style override and no per-page or per-animal Fierce Mode override.
- Keep the consistency mechanism prompt-only. Preserve physical-trait continuity through generated prompt text; do not add a generated-image inspection / vision-extraction loop.
- Prompt generation must distinguish between **identity invariants** and **scene variety**:
  - Identity invariants stay consistent across pages: species/subspecies, face shape, body colors, markings, horns/antlers/tusks, mane, tail, distinctive proportions, and other stable physical features.
  - Scene variety should loosen up across pages: pose, action, camera angle, side/front/three-quarter/back view when appropriate, framing, placement in the composition, and what the animal is doing (standing, running, jumping, swimming, diving, flying, climbing, crouching, etc., as appropriate to the animal and page topic).
- Per-page visual prompts should remain anchored enough that the same animal is recognizable across the book, but they should not all reuse the same body pose, viewing angle, placement, or static portrait-like setup.
- The user's chosen art style is persisted in the resulting `IStoryManifest` via the existing `IStoryManifest.visualAnchor.animalA.artStyle` / `.animalB.artStyle` fields. Fierce Mode does not require a manifest schema change; it only needs to be reflected in the generated prompts/images for the story being created.

## Constraints

- The art-style choice and Fierce Mode are per-generation creative parameters, **not** `AiConfig` fields. They must not be added to `AiConfig` or persisted across sessions in the AI-config context.
- No free-form art-style text input. The picker is a closed enum of the six options listed above; users cannot type a custom style string.
- Fierce Mode is a boolean toggle only. Do not add a multi-level intensity slider, custom text field, or separate preset list for intensity.
- Preset descriptor strings must layer cleanly on top of the existing "children's educational book" framing already baked into `ImageService.generateImage`'s default styling and `getAnimalVisualDescriptions`'s system prompt — the preset describes the *medium*, not the framing.
- Fierce Mode descriptors must describe expression, posture, and energy, not medium. They must layer cleanly with every art style, including delicate styles like Watercolor and Colored Pencil Sketch.
- "Surprise Me" must preserve today's LLM-picks-style behavior for the art-style choice itself: the LLM still chooses one shared style when no specific preset is selected. Existing stories generated before this change must remain readable; nothing about the manifest schema changes.
- The prompt-variety work must not weaken physical-trait continuity. The same animal should remain recognizably the same individual from page to page even when pose, view angle, action, or framing changes.
- The art-style picker and Fierce Mode toggle are disabled while a generation is in flight, matching the existing pattern for the Animal A / B inputs and the Advanced Options selects.
- Do not add the art-style options or Fierce Mode to LLM-provider model lists, image-model lists, or anywhere they could be confused with provider/model configuration.
- Do not introduce a vision-model dependency, image-analysis API call, or post-generation prompt-repair pass as part of this change.

## Acceptance Criteria

- The Dashboard form renders a visible art-style picker in its primary input area (not inside Advanced Options) with the six listed options in the specified order, "Surprise Me" selected by default on first load.
- The Dashboard Advanced Options panel renders a Fierce Mode toggle, default off, disabled during generation.
- Selecting any non-"Surprise Me" preset and generating a story results in every image-generation request — the cover plus all 26 page images — including the chosen style's descriptor string in its prompt (verifiable by inspecting prompts sent to `/api/image/generate` or by inspecting the per-page `visualPrompt` and the constructed cover prompt).
- Selecting "Surprise Me" and generating a story results in `LlmService.getAnimalVisualDescriptions` choosing one art style and that single style appearing in both the page prompts **and** the cover prompt (i.e., cover style matches book style; this is a behavior change from today, where the cover was decoupled).
- Selecting Fierce Mode and generating a story results in every image-generation request — the cover plus all 26 page images — including children's-book-safe intensity language such as powerful posture, alert expression, or dynamic energy, without gore, injury, blood, horror, or adult violence cues.
- Generating with Fierce Mode off omits the fierce/intensity modifier while still applying the selected or surprise art style.
- Generating the same animal pair (e.g., Lion vs. Tiger) once with "Watercolor" and once with "Graphic Novel" produces visibly different illustrations on manual inspection — page imagery and cover imagery both reflect the chosen medium.
- Generating the same animal pair and art style once with Fierce Mode off and once with Fierce Mode on produces visibly different animal expressions/postures/energy on manual inspection, while remaining appropriate for a children's educational book.
- For a single generated story, repeated pages for the same animal keep stable physical traits (colors, markings, face shape, distinctive appendages/features), but vary pose, action, viewing angle, framing, or placement enough that pages do not feel like near-duplicates of the same animal portrait.
- Prompt inspection for a generated story shows that page prompts preserve physical identity while including scene-specific pose/action/composition details; they do not all lock the animal to the same pose, camera angle, or centered static framing.
- The resulting `IStoryManifest.visualAnchor.animalA.artStyle` (and `.animalB.artStyle`) reflects the user's chosen style descriptor when a specific preset was picked, or the LLM-chosen descriptor when "Surprise Me" was picked.
- The art-style picker and Fierce Mode toggle are disabled during generation, alongside the existing animal-name inputs and Advanced Options selects.
- No LLM-model dropdown, image-model dropdown, provider list, or test fixture exposes the art-style enum values or Fierce Mode as model/provider configuration.

## Non-Goals

- Free-form / custom-text art-style input. The closed enum is the entire art-style surface.
- Per-page or per-animal style overrides. One style per book.
- Per-page or per-animal Fierce Mode overrides. Fierce Mode is one boolean per generated book.
- Re-generating or re-styling an existing story in the user's library with a different style or Fierce Mode setting. The controls affect new generations only.
- Adding more than six art-style presets, dynamically loading presets, or letting users save personal preset lists.
- Adding a Fierce Mode intensity slider, multiple fierceness presets, or custom intensity text.
- Persisting the user's art-style preference or Fierce Mode preference across sessions in `AiConfig` or anywhere else. Each generation starts with "Surprise Me" selected and Fierce Mode off.
- Special "cover-only" art style or "cover-only" Fierce Mode. Cover and pages share one visual treatment.
- Making story text, educational content, battle outcomes, or surprise-ending behavior more aggressive when Fierce Mode is enabled.
- Adding a generated-image inspection / vision extraction loop. Consistency and variety are handled through prompt design only.
- Updating user-facing documentation (`README.md`, `apex/README.md`) — neither file currently describes the art-style flow, and adding documentation is out of scope for this change.
- Changing the prompt-engineering structure used by `getAspectsForAnimal` or `getShowdownAndOutcome` beyond what is needed to thread the chosen style, optional Fierce Mode, cover consistency, and identity-vs-variety prompt guidance.
