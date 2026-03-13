# Model Selection UI Tidy-Up

## Problem

The LLM provider and image model dropdowns sit above the animal input form, forcing users to scroll past configuration they rarely change to reach the primary action. The defaults also don't reflect the best available options.

## Design

### Layout

Move the provider/model selectors from above the form to below it, inside a native `<details>` disclosure element.

**Structure within the generator section:**

1. "Create a New Story" heading
2. Animal input form row (Animal A, VS badge, Animal B, Generate button)
3. Border separator
4. `<details>` element, collapsed by default:
   - `<summary>` labeled "Advanced Options"
   - Single row containing both selectors: LLM Provider and Image Model

**Alignment:** The disclosure triangle and its content left-align with the Animal A input. Both selectors sit on the same horizontal line when expanded.

**Implementation:** Use native `<details><summary>` HTML — no JavaScript needed for toggle behavior. Alignment achieved by matching the flex layout of the form row (same column widths and gaps).

### Default Changes

**LLM Provider:** When multiple providers are available, default to `anthropic` instead of `gemini`. Anthropic produces better narrative quality for this app's story generation use case.

- Change `defaultConfig.llmProvider` from `'gemini'` to `'anthropic'` in `AiConfigContext.tsx`
- Update the auto-selection logic: when both API keys are present, prefer Anthropic

**Image Model:** Change the default from `gemini-2.5-flash-image` to `gemini-3.1-flash-image-preview` in the Dashboard component's `<select>` element.

### What Stays the Same

- LLM dropdown hidden when only one provider is available
- Image model dropdown always visible (inside the disclosure)
- `AiConfig` context shape and service layer unchanged
- No backend changes needed

## Files Affected

- `apex/src/components/dashboard/Dashboard.tsx` — move selectors below form, wrap in `<details>`, update image model default
- `apex/src/index.css` — update `.provider-selector` styles for horizontal layout within disclosure
- `apex/src/contexts/AiConfigContext.tsx` — change default LLM provider to `anthropic`, update auto-selection preference order
