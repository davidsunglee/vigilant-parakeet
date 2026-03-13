# Model Selection UI Tidy-Up Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move model selection dropdowns below the generator form into a collapsible "Advanced Options" section, and update defaults to Anthropic LLM + Gemini 3.1 Flash image model.

**Architecture:** Three targeted edits — one context file for the LLM default, one component for layout restructuring and image model default, one CSS file for disclosure styling. No backend changes.

**Tech Stack:** React, CSS, native HTML `<details>`/`<summary>`

**Note:** This project has no frontend test infrastructure, so tasks omit test steps. Verification is manual (dev server).

---

## File Map

- **Modify:** `apex/src/contexts/AiConfigContext.tsx:17` — change `llmProvider` default from `'gemini'` to `'anthropic'`
- **Modify:** `apex/src/components/dashboard/Dashboard.tsx:102-163` — restructure generator section: move selectors below form, wrap in `<details>`, update image model default
- **Modify:** `apex/src/index.css:106-125` — replace `.provider-selector` styles with `.advanced-options` disclosure styles

---

### Task 1: Change default LLM provider

**Files:**
- Modify: `apex/src/contexts/AiConfigContext.tsx:17`

- [ ] **Step 1: Update the default config**

In `AiConfigContext.tsx`, change line 17:

```typescript
// Before:
const defaultConfig: AiConfig = {
  llmProvider: 'gemini',
  imageProvider: 'gemini',
};

// After:
const defaultConfig: AiConfig = {
  llmProvider: 'anthropic',
  imageProvider: 'gemini',
};
```

- [ ] **Step 2: Verify**

Run: `cd apex && npm run build`
Expected: No type errors or build failures.

- [ ] **Step 3: Commit**

```bash
git add apex/src/contexts/AiConfigContext.tsx
git commit -m "feat: default LLM provider to Anthropic for better narrative quality"
```

---

### Task 2: Restructure generator section layout

**Files:**
- Modify: `apex/src/components/dashboard/Dashboard.tsx:102-163`

- [ ] **Step 1: Move selectors below form and wrap in `<details>`**

Replace the generator section JSX (lines 102–164) with this structure. The form comes first, then a `<details>` element containing both selectors on one row:

```tsx
<div className="generator-section">
    <h2>Create a New Story</h2>
    <form onSubmit={handleGenerate} className="generator-form">
        <div className="input-group">
            <Search className="input-icon" size={20} />
            <input
                type="text"
                placeholder="Animal A (e.g., Lion)"
                value={animalA}
                onChange={(e) => setAnimalA(e.target.value)}
                list="animals"
                disabled={isGenerating}
                required
            />
        </div>
        <span className="vs-badge">VS</span>
        <div className="input-group">
            <Search className="input-icon" size={20} />
            <input
                type="text"
                placeholder="Animal B (e.g., Tiger)"
                value={animalB}
                onChange={(e) => setAnimalB(e.target.value)}
                list="animals"
                disabled={isGenerating}
                required
            />
        </div>
        <button type="submit" disabled={isGenerating || !animalA || !animalB} className="generate-btn">
            {isGenerating ? 'Generating Simulation...' : <span><Sparkles size={18} /> Generate Story</span>}
        </button>
    </form>
    <details className="advanced-options">
        <summary>Advanced Options</summary>
        <div className="advanced-options-content">
            {availableProviders.llm.length > 1 && (
                <div className="provider-selector">
                    <label htmlFor="llm-provider">LLM Provider:</label>
                    <select
                        id="llm-provider"
                        value={config.llmProvider}
                        onChange={(e) => setConfig({ ...config, llmProvider: e.target.value })}
                        disabled={isGenerating}
                    >
                        {availableProviders.llm.map((p) => (
                            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                        ))}
                    </select>
                </div>
            )}
            <div className="provider-selector">
                <label htmlFor="image-model">Image Model:</label>
                <select
                    id="image-model"
                    value={config.imageModel ?? 'gemini-3.1-flash-image-preview'}
                    onChange={(e) => setConfig({ ...config, imageModel: e.target.value })}
                    disabled={isGenerating}
                >
                    <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash</option>
                    <option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option>
                </select>
            </div>
        </div>
    </details>
    <datalist id="animals">
        {commonAnimals.map(a => <option key={a} value={a} />)}
    </datalist>
</div>
```

Key changes:
- Form moves above selectors
- Selectors wrapped in `<details className="advanced-options">`
- Image model default changed to `gemini-3.1-flash-image-preview`
- Image model `<option>` order swapped (3.1 first)
- Label changed from "AI Model" to "LLM Provider" for clarity

- [ ] **Step 2: Verify**

Run: `cd apex && npm run build`
Expected: No type errors or build failures.

Start dev server and verify:
1. Form (animal inputs + generate button) appears first
2. "Advanced Options" disclosure appears below, collapsed
3. Clicking disclosure reveals both selectors on one row
4. Selectors are disabled during generation

- [ ] **Step 3: Commit**

```bash
git add apex/src/components/dashboard/Dashboard.tsx
git commit -m "feat: move model selectors into collapsible Advanced Options below form"
```

---

### Task 3: Style the disclosure element

**Files:**
- Modify: `apex/src/index.css:106-125`

- [ ] **Step 1: Replace `.provider-selector` styles with disclosure styles**

Replace the existing `.provider-selector` block (lines 106–125) with:

```css
/* Advanced Options Disclosure */
.advanced-options {
    margin-top: 20px;
    border-top: 1px solid var(--border-color);
    padding-top: 16px;
    text-align: left;
}

.advanced-options summary {
    font-size: 0.9rem;
    color: var(--text-secondary);
    cursor: pointer;
    font-weight: 500;
    padding: 4px 0;
    list-style: revert;
}

.advanced-options summary:hover {
    color: var(--text-primary);
}

.advanced-options-content {
    display: flex;
    align-items: center;
    gap: 24px;
    margin-top: 12px;
    flex-wrap: wrap;
}

.provider-selector {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.provider-selector label {
    font-size: 0.9rem;
    color: var(--text-secondary);
}

.provider-selector select {
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    background: var(--bg-color);
    color: var(--text-primary);
    font-size: 0.9rem;
    font-family: inherit;
}
```

Key changes:
- New `.advanced-options` class for the `<details>` element: border-top separator, left-aligned text
- New `.advanced-options-content` class: flexbox row layout with `gap: 24px` so both selectors sit side-by-side
- `.provider-selector` retains its label+select flex layout but drops `margin-bottom` (now handled by parent gap)
- `select` background uses `var(--bg-color)` instead of `var(--input-bg)` for consistency

- [ ] **Step 2: Verify**

Start dev server and verify:
1. Disclosure triangle left-aligns with the Animal A input area
2. "Advanced Options" text is secondary color, highlights on hover
3. When expanded, both selectors appear on one horizontal line
4. Border separator visually groups disclosure with generator section
5. On narrow viewports, selectors wrap naturally via flexbox

- [ ] **Step 3: Commit**

```bash
git add apex/src/index.css
git commit -m "feat: style Advanced Options disclosure with horizontal selector layout"
```
