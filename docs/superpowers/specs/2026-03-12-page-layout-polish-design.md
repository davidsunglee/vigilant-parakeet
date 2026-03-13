# Page Layout Polish Design

## Problem

The book viewer's left and right pages have inconsistent vertical alignment:

1. **Misaligned images** — Left pages have a header with title text that pushes the accent line and image down. Right pages have no header, so images sit higher.
2. **No spacing between header line and image** — The image starts immediately below the header line.
3. **Text pinned to bottom** — `margin-top: auto` on `.text-content` pushes text to the page bottom, leaving awkward whitespace between image and text.
4. **Fun fact placement inconsistent** — The fun fact sits inside `.text-content` with no fixed position, so it floats differently depending on text length.

## Solution

Four coordinated CSS/JSX changes to create consistent, aligned page layouts.

### 1. Fixed-Height Header Zone

**Technique:** Replace the current `.page-title` rendering with a fixed-height `.header-zone` container that uses flexbox to push the accent line to the bottom of the zone.

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

- **Left pages (`page.isLeftPage === true`):** Render title text + accent line inside the zone
- **Right pages (`page.isLeftPage === false`):** Render only the accent line — it lands at the same Y position because `justify-content: flex-end` pushes it to the bottom of the fixed-height container

**JSX change:** Every content page renders a `.header-zone`. The title text is conditionally rendered based on `page.isLeftPage` (not `page.title`), ensuring alignment is determined by page side, not by whether a title string happens to be truthy.

```jsx
<div className="header-zone">
  {page.isLeftPage && page.title && <h3 className="page-title">{page.title}</h3>}
  <div className="header-accent-line" />
</div>
```

The `.page-title` border-bottom is removed (the accent line is now a separate element). The `.page-title` keeps its font styling but loses `margin-bottom`, `border-bottom`, and `padding-bottom`.

### 2. Spacing Between Header Line and Image

Add `margin-top: 12px` to `.visual-content` and remove the existing `margin-bottom: 20px` (the gap below the image is now handled by `.text-content`'s margin-top):

```css
.visual-content {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 12px;
  /* margin-bottom removed */
}
```

### 3. Text Flows Below Image

Remove `margin-top: auto` from `.text-content` and replace with a fixed gap:

```css
.text-content {
  margin-top: 12px;
}
```

Total gap between image bottom and text: 12px (just the `.text-content` margin-top, since `.visual-content` margin-bottom is removed).

### 4. Fun Fact + Footer Line

**JSX restructure:** Move the fun fact out of `.text-content` so it becomes a direct child of `.page-media-layout`. The internal fun fact markup (icon wrapper, tooltip, hover reveal) is unchanged — only its position in the DOM tree moves. Add a `.footer-line` element and move the page number into the flow.

**CSS changes:**

```css
.fun-fact-box {
  margin-top: auto; /* flex-pushes to bottom of .page-media-layout */
  margin-bottom: 10px;
}

.footer-line {
  border-top: 2px solid #d4c9a8;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.page-number {
  font-weight: 700;
  color: #a0aec0;
  font-size: 1rem;
  padding-bottom: 12px;
  /* position: absolute and bottom: 20px removed */
}

.page-left .page-number {
  text-align: left;
}

.page-right .page-number {
  text-align: right;
}
```

The footer line uses a warm muted tone (`#d4c9a8`) matching the page palette — same 2px thickness as the header accent line but visually distinct. Hardcoded rather than using a CSS variable because it's specific to the book page context (the existing page uses hardcoded colors like `#f7f3e8`, `#2c2f33`, `#a0aec0` throughout).

Page number left/right alignment switches from absolute `left`/`right` positioning to `text-align` since the element is now in normal flow.

## Complete Target JSX

Full content-page template with all four changes applied:

```jsx
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
```

## Mobile Responsive Updates

The existing `@media (max-width: 768px)` block needs these additions:

```css
@media (max-width: 768px) {
  .header-zone {
    padding: 12px 15px 0 15px;
    min-height: 44px;
  }

  .page-title {
    font-size: 1.3rem;
  }

  .footer-line {
    margin-bottom: 6px;
  }

  .page-number {
    padding-bottom: 8px;
  }
}
```

The header zone padding matches the existing mobile `.page-content` padding (15px horizontal). The min-height is reduced proportionally. Existing mobile overrides for `.page-title` font-size are preserved.

## Files Changed

| File | Changes |
|------|---------|
| `BookViewer.tsx` | Restructure JSX: add `.header-zone` wrapper with conditional title based on `page.isLeftPage`, move fun fact out of `.text-content`, move page number into flow inside `.page-media-layout`, add `.header-accent-line` and `.footer-line` elements |
| `BookViewer.css` | Add `.header-zone`, `.header-accent-line`, `.footer-line` styles. Update `.page-title` (remove border/margin/padding). Update `.visual-content` (add margin-top, remove margin-bottom). Replace `.text-content` `margin-top: auto` with fixed 12px margin. Update `.page-number` to flow positioning with text-align. Add mobile responsive overrides for new elements. |

## Pages Not Affected

- Front cover, back cover, and checklist page retain their existing layout — these changes only apply to content pages rendered from `story.pages`.
