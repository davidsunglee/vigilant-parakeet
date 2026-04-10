# Page Layout Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix vertical alignment inconsistencies between left and right pages in the book viewer by introducing a fixed-height header zone, adjusting image-to-text spacing, and restructuring the fun fact / footer into a consistent bottom section.

**Architecture:** Four coordinated CSS/JSX changes to `BookViewer.tsx` and `BookViewer.css`. The header zone ensures the accent line lands at the same Y-position regardless of whether the page has a title. The fun fact moves out of `.text-content` to become a flex-pushed bottom element. A footer line and flow-positioned page number replace the current absolute positioning.

**Tech Stack:** React 18 + TypeScript, plain CSS, lucide-react icons

---

## Chunk 1: Header Zone and Spacing

### Task 1: Add header-zone and header-accent-line CSS

**Files:**
- Modify: `apex/src/components/book/BookViewer.css:123-131` (`.page-title` block)

- [ ] **Step 1: Add `.header-zone` and `.header-accent-line` styles**

Add these new rules immediately before the existing `.page-title` rule (before line 123):

```css
.header-zone {
  padding: 16px 30px 0 30px;
  min-height: 52px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  flex-shrink: 0;
}

.header-accent-line {
  border-bottom: 2px solid var(--accent-color);
}
```

- [ ] **Step 2: Update `.page-title` — remove border, margin, padding**

Change the existing `.page-title` rule from:

```css
.page-title {
    font-size: 1.35rem;
    font-weight: 800;
    color: #1a1b1e;
    margin-bottom: 12px;
    border-bottom: 2px solid var(--accent-color);
    padding-bottom: 5px;
}
```

To:

```css
.page-title {
    font-size: 1.35rem;
    font-weight: 800;
    color: #1a1b1e;
}
```

The accent line is now a separate `.header-accent-line` element, so `margin-bottom`, `border-bottom`, and `padding-bottom` are removed from `.page-title`.

- [ ] **Step 3: Verify CSS parses correctly**

Run: `cd apex && npx tsc --noEmit`
Expected: No errors (CSS isn't type-checked, but confirms no TS breakage from the unchanged TSX)

- [ ] **Step 4: Commit**

```bash
git add apex/src/components/book/BookViewer.css
git commit -m "style: add header-zone and header-accent-line CSS, simplify page-title"
```

### Task 2: Update JSX to use header-zone wrapper

**Files:**
- Modify: `apex/src/components/book/BookViewer.tsx:88-126` (content page rendering)

- [ ] **Step 1: Replace the title rendering with header-zone wrapper**

In `BookViewer.tsx`, change the content page map block. Replace lines 89-91:

```jsx
<div key={page.index} className={`page ${page.isLeftPage ? 'page-left' : 'page-right'}`}>
    <div className="page-content">
        {page.title && <h3 className="page-title">{page.title}</h3>}
```

With:

```jsx
<div key={page.index} className={`page ${page.isLeftPage ? 'page-left' : 'page-right'}`}>
    <div className="page-content">
        <div className="header-zone">
            {page.isLeftPage && page.title && <h3 className="page-title">{page.title}</h3>}
            <div className="header-accent-line" />
        </div>
```

Key change: The title is now conditional on `page.isLeftPage` (not just `page.title`), so right pages always get an empty header zone with just the accent line at the same vertical position.

- [ ] **Step 2: Verify the build compiles**

Run: `cd apex && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apex/src/components/book/BookViewer.tsx
git commit -m "feat: wrap page title in header-zone with accent line for consistent alignment"
```

### Task 3: Update visual-content and text-content spacing

**Files:**
- Modify: `apex/src/components/book/BookViewer.css:217-223` (`.visual-content`)
- Modify: `apex/src/components/book/BookViewer.css:132-134` (`.text-content`)

- [ ] **Step 1: Update `.visual-content` — add margin-top, remove margin-bottom**

Change the `.visual-content` rule from:

```css
.visual-content {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
}
```

To:

```css
.visual-content {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 12px;
}
```

- [ ] **Step 2: Update `.text-content` — replace `margin-top: auto` with fixed gap**

Change the `.text-content` rule from:

```css
.text-content {
    margin-top: auto;
}
```

To:

```css
.text-content {
    margin-top: 12px;
}
```

This removes the flex-push behavior that was creating awkward whitespace between image and text. Text now flows naturally 12px below the image.

- [ ] **Step 3: Verify the build compiles**

Run: `cd apex && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apex/src/components/book/BookViewer.css
git commit -m "style: fix image-text spacing with consistent 12px gaps"
```

## Chunk 2: Fun Fact, Footer Line, and Mobile

### Task 4: Add footer-line CSS and update page-number + fun-fact-box positioning

**Files:**
- Modify: `apex/src/components/book/BookViewer.css:143-148` (`.fun-fact-box`)
- Modify: `apex/src/components/book/BookViewer.css:242-256` (`.page-number` and variants)

- [ ] **Step 1: Update `.fun-fact-box` margin**

Change the `.fun-fact-box` rule from:

```css
.fun-fact-box {
    margin-top: auto;
    margin-bottom: 25px;
    display: flex;
    align-items: center;
}
```

To:

```css
.fun-fact-box {
    margin-top: auto;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
}
```

The `margin-top: auto` is kept here — this is intentional. Since the fun fact is being moved out of `.text-content` and becomes a direct child of `.page-media-layout` (a flex column), `margin-top: auto` pushes it to the bottom of the remaining space. The `margin-bottom` is reduced from 25px to 10px.

- [ ] **Step 2: Add `.footer-line` style**

Add this new rule immediately after the `.fun-fact-tooltip::after` block (after line 215):

```css
.footer-line {
    border-top: 2px solid #d4c9a8;
    margin-bottom: 8px;
    flex-shrink: 0;
}
```

Uses a warm muted tone (`#d4c9a8`) matching the parchment page palette — same 2px thickness as the header accent line but visually distinct.

- [ ] **Step 3: Update `.page-number` — remove absolute positioning, add text-align**

Change the `.page-number` and its variants from:

```css
.page-number {
    position: absolute;
    bottom: 20px;
    font-weight: 700;
    color: #a0aec0;
    font-size: 1rem;
}

.page-left .page-number {
    left: 40px;
}

.page-right .page-number {
    right: 40px;
}
```

To:

```css
.page-number {
    font-weight: 700;
    color: #a0aec0;
    font-size: 1rem;
    padding-bottom: 12px;
}

.page-left .page-number {
    text-align: left;
}

.page-right .page-number {
    text-align: right;
}
```

The page number is now in normal document flow inside `.page-media-layout`, so absolute positioning is replaced with `text-align` for left/right alignment.

- [ ] **Step 4: Verify the build compiles**

Run: `cd apex && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apex/src/components/book/BookViewer.css
git commit -m "style: add footer-line, update page-number to flow positioning"
```

### Task 5: Restructure JSX — move fun fact, add footer line

**Files:**
- Modify: `apex/src/components/book/BookViewer.tsx:88-126` (content page rendering)

- [ ] **Step 1: Restructure the content page template**

Replace the entire content page map block (the `{story.pages.map((page) => (...))}` section) with:

```jsx
{story.pages.map((page) => (
    <div key={page.index} className={`page ${page.isLeftPage ? 'page-left' : 'page-right'}`}>
        <div className="page-content">
            <div className="header-zone">
                {page.isLeftPage && page.title && <h3 className="page-title">{page.title}</h3>}
                <div className="header-accent-line" />
            </div>

            <div className="page-media-layout">
                <div className="visual-content">
                    {page.imageUrl ? (
                        <img src={page.imageUrl} alt="Generated Illustration" className="generated-image" />
                    ) : (
                        <div className="placeholder-image">
                            <span>{page.visualPrompt}</span>
                        </div>
                    )}
                </div>

                <div className="text-content">
                    <p>{page.bodyText}</p>
                </div>

                {page.funFact && (
                    <div className="fun-fact-box">
                        <h4>
                            <div className="fun-fact-icon-wrapper">
                                <Info size={18} />
                                <div className="fun-fact-tooltip">
                                    {page.funFact}
                                </div>
                            </div>
                            Fun Fact
                        </h4>
                    </div>
                )}

                <div className="footer-line" />
                <div className="page-number">{page.index}</div>
            </div>
        </div>
    </div>
))}
```

Four structural changes from the current JSX:
1. **Header zone** wraps the title + accent line (already done in Task 2, but included here for the complete picture — if Tasks 1-3 were already applied, this is already correct)
2. **Fun fact** moved from inside `.text-content` to a direct child of `.page-media-layout`
3. **Footer line** added as a new `<div className="footer-line" />` element
4. **Page number** moved from `.page-content` to inside `.page-media-layout`, after the footer line

- [ ] **Step 2: Verify the build compiles**

Run: `cd apex && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apex/src/components/book/BookViewer.tsx
git commit -m "feat: restructure page layout — fun fact to bottom, add footer line"
```

### Task 6: Add mobile responsive overrides

**Files:**
- Modify: `apex/src/components/book/BookViewer.css:386-453` (mobile media query block)

- [ ] **Step 1: Remove `margin-bottom` from mobile `.page-title` override**

In the existing `@media (max-width: 768px)` block, change the `.page-title` override (around line 425-428) from:

```css
    .page-title {
        font-size: 1.3rem;
        margin-bottom: 12px;
    }
```

To:

```css
    .page-title {
        font-size: 1.3rem;
    }
```

The base `.page-title` no longer has `margin-bottom` (removed in Task 1), so this mobile override must also drop it. Otherwise the title would push the accent line down on mobile, defeating the header-zone alignment fix.

- [ ] **Step 2: Add mobile overrides for new elements**

Immediately after the updated `.page-title` mobile override, add:

```css
    .header-zone {
        padding: 12px 15px 0 15px;
        min-height: 44px;
    }

    .footer-line {
        margin-bottom: 6px;
    }

    .page-number {
        padding-bottom: 8px;
    }
```

The header zone padding matches the existing mobile `.page-content` padding (15px horizontal). The min-height is reduced proportionally.

- [ ] **Step 3: Verify the build compiles**

Run: `cd apex && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apex/src/components/book/BookViewer.css
git commit -m "style: add mobile responsive overrides for header-zone and footer"
```

## Chunk 3: Visual Verification

### Task 7: Visual verification

**Files:**
- No file changes — verification only

- [ ] **Step 1: Start the dev server**

Run: `cd apex && npm run dev`
Expected: Vite dev server starts on `http://localhost:5173`

- [ ] **Step 2: Open a story and verify left page layout**

Open a story in the book viewer. Navigate to a left page (odd-numbered). Verify:
- Title text appears above the accent line
- Accent line is a 2px orange (`var(--accent-color)`) line
- 12px gap between accent line and image
- Image displays naturally (no cropping)
- 12px gap between image and body text
- Fun fact badge sits at bottom of content area (pushed by `margin-top: auto`)
- Footer line (2px, `#d4c9a8` warm muted tone) appears below fun fact
- Page number appears below footer line, left-aligned

- [ ] **Step 3: Verify right page layout**

Navigate to a right page (even-numbered). Verify:
- No title text, but accent line sits at the same Y-position as the left page
- Image starts at same vertical position as left page image
- Fun fact, footer line, page number all consistent
- Page number is right-aligned

- [ ] **Step 4: Verify pages without fun facts**

Find a page that has no fun fact. Verify:
- Footer line and page number still appear at the bottom
- No empty space or broken layout where the fun fact would be

- [ ] **Step 5: Verify mobile layout (resize browser to < 768px)**

Resize the browser window below 768px width. Verify:
- Header zone has reduced padding (15px horizontal) and min-height (44px)
- Footer line has reduced margin-bottom (6px)
- Page number has reduced padding-bottom (8px)
- Title font-size is reduced (1.3rem)
- Overall layout remains consistent between left and right pages

- [ ] **Step 6: Final commit (if any adjustments were needed)**

If no adjustments needed, skip this step. Otherwise:

```bash
git add -A
git commit -m "fix: visual adjustments from layout polish verification"
```
