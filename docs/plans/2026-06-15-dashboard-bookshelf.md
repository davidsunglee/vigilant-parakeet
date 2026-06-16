# Apex Dashboard "Reading Room" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the logged-in dashboard as the Apex "Reading Room": a clean gallery shelf of story covers, a title-page composer overlay, an account masthead, and status-native cards, all on the `--apex-*` design system.

**Architecture:** Decompose the surface into four focused components under `apex/src/components/dashboard/` (`StoryCard`, `MatchupComposer`, `Masthead`, and the `Dashboard` orchestrator) plus one stylesheet (`Dashboard.css`). The orchestrator keeps the existing data and Realtime logic and the full `CatalogService` contract; the new components are presentational with clear props. Build bottom-up (leaf components first, each test-driven), then the orchestrator, then styling and cleanup.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + Testing Library, lucide-react, plain CSS with `--apex-*` custom properties (no Tailwind).

**Spec:** `docs/specs/2026-06-15-dashboard-bookshelf.md`

**Branch:** `redesign/apex-dashboard` (already created; the spec is committed there).

**Conventions:**
- All commands run from the repo root unless noted.
- Test: `npm --prefix apex run test:run -- <path>` runs one file. Lint: `npm --prefix apex run lint`. Build: `npm --prefix apex run build`.
- No em dashes in any copy or doc (verify with `grep -rn "$(printf '\u2014')" <path>`).

---

## File Structure

- **Create** `apex/src/components/dashboard/StoryCard.tsx`: status-aware card (ready / generating / failed); exports `winnerLabel`.
- **Create** `apex/src/components/dashboard/StoryCard.test.tsx`
- **Create** `apex/src/components/dashboard/MatchupComposer.tsx`: title-page form, `inline` and `overlay` variants; owns its form state.
- **Create** `apex/src/components/dashboard/MatchupComposer.test.tsx`
- **Create** `apex/src/components/dashboard/Masthead.tsx`: brand, "Begin a new matchup" stamp, account menu.
- **Create** `apex/src/components/dashboard/Masthead.test.tsx`
- **Modify** `apex/src/components/dashboard/Dashboard.tsx`: orchestrator (data, Realtime, search/sort, empty/overlay wiring).
- **Modify** `apex/src/components/dashboard/Dashboard.test.tsx`: rewritten to the new model.
- **Create** `apex/src/components/dashboard/Dashboard.css`: all dashboard styling on `--apex-*`.
- **Modify** `apex/src/types/artStyle.ts`: rename `Storybook Painterly` label to `Painterly`.
- **Modify** `apex/src/App.tsx`: remove the inline sign-out chrome.
- **Modify** `apex/src/index.css`: delete dashboard-only classes and the four dashboard-only legacy tokens.

---

## Task 1: StoryCard component

A presentational, memoized card that renders one of three status layouts. Extracted from the current inline component in `Dashboard.tsx` and redesigned. Class names use the `rr-` (Reading Room) prefix; styling arrives in Task 5.

**Files:**
- Create: `apex/src/components/dashboard/StoryCard.tsx`
- Test: `apex/src/components/dashboard/StoryCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apex/src/components/dashboard/StoryCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoryCard } from './StoryCard';
import { createMockStoryRecord } from '../../test/fixtures';

function noop() {}

describe('StoryCard', () => {
  it('renders a ready card with cover, Read, and reveal-winner', async () => {
    const ready = createMockStoryRecord();
    const onReadStory = vi.fn();
    const onToggleWinner = vi.fn();
    const { rerender } = render(
      <StoryCard
        story={ready}
        coverUrl="https://signed/cover.png"
        isWinnerRevealed={false}
        onToggleWinner={onToggleWinner}
        onReadStory={onReadStory}
        onDelete={noop}
      />,
    );

    expect(screen.getByAltText('Lion vs Tiger')).toHaveAttribute('src', 'https://signed/cover.png');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /read the book/i }));
    expect(onReadStory).toHaveBeenCalledWith('story-1');

    await user.click(screen.getByRole('button', { name: /reveal winner/i }));
    expect(onToggleWinner).toHaveBeenCalledWith('story-1');

    // When revealed, the winner label (manifest.outcome.winnerId 'animalA' => Lion) shows.
    rerender(
      <StoryCard
        story={ready}
        coverUrl="https://signed/cover.png"
        isWinnerRevealed={true}
        onToggleWinner={onToggleWinner}
        onReadStory={onReadStory}
        onDelete={noop}
      />,
    );
    expect(screen.getByText(/winner: lion/i)).toBeInTheDocument();
  });

  it('renders a generating card with a progress bar and step, no Read', () => {
    const generating = createMockStoryRecord({
      id: 'gen-1',
      status: 'generating',
      title: null,
      manifest: null,
      cover_image_path: null,
      progress_step: 'Illustrating the pages...',
      progress_pct: 42,
    });
    render(
      <StoryCard
        story={generating}
        isWinnerRevealed={false}
        onToggleWinner={noop}
        onReadStory={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByText('Illustrating the pages...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(screen.queryByRole('button', { name: /read the book/i })).not.toBeInTheDocument();
  });

  it('renders a failed card with its error and Remove, no Read', () => {
    const failed = createMockStoryRecord({
      id: 'fail-1',
      status: 'failed',
      title: null,
      manifest: null,
      cover_image_path: null,
      error: 'API quota exceeded',
    });
    render(
      <StoryCard
        story={failed}
        isWinnerRevealed={false}
        onToggleWinner={noop}
        onReadStory={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByText(/did not come together/i)).toBeInTheDocument();
    expect(screen.getByText(/api quota exceeded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove story/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /read the book/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apex run test:run -- src/components/dashboard/StoryCard.test.tsx`
Expected: FAIL, cannot resolve `./StoryCard` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `apex/src/components/dashboard/StoryCard.tsx`:

```tsx
import React from 'react';
import { BookOpen, Trophy, Eye, AlertTriangle, Trash2 } from 'lucide-react';
import { StoryRecord } from '../../types/story.types';

/** Resolves the human-readable winner label from a ready story's manifest. */
export function winnerLabel(story: StoryRecord): string {
  const outcome = story.manifest?.outcome;
  if (!outcome) return 'Unknown';
  if (outcome.winnerId === 'none') return 'None (Surprise!)';
  if (outcome.winnerId === 'animalA') {
    return story.manifest?.animalA.commonName ?? story.animal_a;
  }
  return story.manifest?.animalB.commonName ?? story.animal_b;
}

export interface StoryCardProps {
  story: StoryRecord;
  coverUrl?: string;
  isWinnerRevealed: boolean;
  onToggleWinner: (id: string) => void;
  onReadStory: (id: string) => void;
  onDelete: (id: string) => void;
}

export const StoryCard = React.memo<StoryCardProps>(function StoryCard({
  story,
  coverUrl,
  isWinnerRevealed,
  onToggleWinner,
  onReadStory,
  onDelete,
}) {
  const titleText = story.title ?? `${story.animal_a} vs ${story.animal_b}`;

  return (
    <article className={`rr-card rr-card--${story.status}`}>
      <div className="rr-cover">
        {story.status === 'ready' && (
          <>
            {coverUrl && (
              <img
                src={coverUrl}
                alt={`${story.animal_a} vs ${story.animal_b}`}
                className="rr-cover-img"
                loading="lazy"
                decoding="async"
              />
            )}
            <div className="rr-card-actions">
              <button type="button" className="rr-read" onClick={() => onReadStory(story.id)}>
                <BookOpen size={15} /> Read the book
              </button>
              <button
                type="button"
                className="rr-remove"
                aria-label="Remove story"
                onClick={() => onDelete(story.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </>
        )}

        {story.status === 'generating' && (
          <div className="rr-press">
            <span className="rr-press-amp" aria-hidden="true">&amp;</span>
            <span className="rr-sweep" aria-hidden="true" />
            <div className="rr-progress">
              <div className="rr-ptrack">
                <div
                  className="rr-pbar"
                  style={{ width: `${story.progress_pct}%` }}
                  role="progressbar"
                  aria-valuenow={story.progress_pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <p className="rr-pstep">{story.progress_step ?? 'Working...'}</p>
            </div>
            <span className="rr-press-cap">On the press</span>
          </div>
        )}

        {story.status === 'failed' && (
          <div className="rr-failed" aria-hidden="true">
            <span className="rr-fail-mark">!</span>
          </div>
        )}
      </div>

      <div className="rr-meta">
        <h3 className="rr-title">{titleText}</h3>
        <p className="rr-date">
          {story.status === 'generating'
            ? 'Just now'
            : new Date(story.created_at).toLocaleDateString()}
        </p>

        {story.status === 'ready' &&
          (isWinnerRevealed ? (
            <button type="button" className="rr-winner" onClick={() => onToggleWinner(story.id)}>
              <Trophy size={13} /> Winner: {winnerLabel(story)}
            </button>
          ) : (
            <button type="button" className="rr-reveal" onClick={() => onToggleWinner(story.id)}>
              <Eye size={13} /> Reveal winner
            </button>
          ))}

        {story.status === 'failed' && (
          <>
            <p className="rr-error" role="alert">
              <AlertTriangle size={13} /> This matchup did not come together.{' '}
              {story.error ?? 'Unknown error'}
            </p>
            <button
              type="button"
              className="rr-remove-text"
              aria-label="Remove story"
              onClick={() => onDelete(story.id)}
            >
              Remove
            </button>
          </>
        )}
      </div>
    </article>
  );
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apex run test:run -- src/components/dashboard/StoryCard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apex/src/components/dashboard/StoryCard.tsx apex/src/components/dashboard/StoryCard.test.tsx
git commit -m "feat(dashboard): add status-aware StoryCard component"
```

---

## Task 2: MatchupComposer component (and Painterly rename)

The title-page form. Owns its own field state, resets on a successful submit, and renders in an `inline` variant (empty-state hero) or an `overlay` variant (modal dialog with Esc and scrim dismiss). Art style is a labeled radio group rendered as chips.

**Files:**
- Modify: `apex/src/types/artStyle.ts`
- Create: `apex/src/components/dashboard/MatchupComposer.tsx`
- Test: `apex/src/components/dashboard/MatchupComposer.test.tsx`

- [ ] **Step 1: Rename the Painterly label**

In `apex/src/types/artStyle.ts`, change the `storybook-painterly` option's label. Find:

```ts
    {
        id: 'storybook-painterly',
        label: 'Storybook Painterly',
        descriptor: 'classic storybook painterly illustration with rich brushwork, warm lighting, soft edges, and gouache-style depth',
    },
```

Change `label: 'Storybook Painterly'` to `label: 'Painterly'` (leave `id` and `descriptor` unchanged).

- [ ] **Step 2: Write the failing test**

Create `apex/src/components/dashboard/MatchupComposer.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchupComposer } from './MatchupComposer';

describe('MatchupComposer', () => {
  it('renders the six art-style chips in order with Painterly renamed, default Surprise Me', () => {
    render(<MatchupComposer variant="inline" onCreate={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.textContent?.trim())).toEqual([
      'Surprise Me',
      'Watercolor',
      'Colored Pencil Sketch',
      'Painterly',
      'Graphic Novel',
      '3D Animated',
    ]);
    expect(screen.getByRole('radio', { name: /surprise me/i })).toBeChecked();
  });

  it('submits the trimmed values and resets the form (inline)', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MatchupComposer variant="inline" onCreate={onCreate} />);

    const a = screen.getByLabelText(/first contender/i) as HTMLInputElement;
    const b = screen.getByLabelText(/second contender/i) as HTMLInputElement;
    await user.type(a, 'Lion');
    await user.type(b, 'Tiger');
    await user.click(screen.getByRole('radio', { name: /watercolor/i }));
    await user.click(screen.getByLabelText(/fierce mode/i));
    await user.click(screen.getByRole('button', { name: /conjure the book/i }));

    expect(onCreate).toHaveBeenCalledWith({
      animalA: 'Lion',
      animalB: 'Tiger',
      artStyle: 'watercolor',
      fierceMode: true,
    });

    await waitFor(() => {
      expect(a).toHaveValue('');
      expect(b).toHaveValue('');
    });
    expect(screen.getByRole('radio', { name: /surprise me/i })).toBeChecked();
    expect(screen.getByLabelText(/fierce mode/i)).not.toBeChecked();
  });

  it('disables Conjure until both contenders are filled', async () => {
    const user = userEvent.setup();
    render(<MatchupComposer variant="inline" onCreate={vi.fn()} />);
    const button = screen.getByRole('button', { name: /conjure the book/i });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/first contender/i), 'Lion');
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/second contender/i), 'Tiger');
    expect(button).toBeEnabled();
  });

  it('overlay variant dismisses on Escape and scrim click', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MatchupComposer variant="overlay" onCreate={vi.fn()} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: /begin a new matchup/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('rr-scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix apex run test:run -- src/components/dashboard/MatchupComposer.test.tsx`
Expected: FAIL, cannot resolve `./MatchupComposer`.

- [ ] **Step 4: Write minimal implementation**

Create `apex/src/components/dashboard/MatchupComposer.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ART_STYLE_OPTIONS, ArtStyleId } from '../../types/artStyle';
import type { CreateStoryInput } from '../../services/CatalogService';

export interface MatchupComposerProps {
  variant: 'inline' | 'overlay';
  onCreate: (input: CreateStoryInput) => void | Promise<void>;
  onClose?: () => void;
}

export function MatchupComposer({ variant, onCreate, onClose }: MatchupComposerProps) {
  const [animalA, setAnimalA] = useState('');
  const [animalB, setAnimalB] = useState('');
  const [artStyle, setArtStyle] = useState<ArtStyleId>('surprise');
  const [fierceMode, setFierceMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    if (variant !== 'overlay' || !onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose!();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [variant, onClose]);

  function reset() {
    setAnimalA('');
    setAnimalB('');
    setArtStyle('surprise');
    setFierceMode(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!animalA.trim() || !animalB.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        animalA: animalA.trim(),
        animalB: animalB.trim(),
        artStyle,
        fierceMode,
      });
      reset();
    } catch {
      setError('Could not start this matchup. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const form = (
    <form className="rr-composer" onSubmit={handleSubmit} noValidate>
      <div className="apex-emblem rr-composer-emblem" aria-hidden="true">
        &amp;
      </div>
      <p className="rr-composer-kick">Begin a New Matchup</p>

      <div className="rr-slots">
        <label className="rr-slot">
          <span className="rr-slot-label">First contender</span>
          <input
            ref={firstFieldRef}
            className="apex-field"
            type="text"
            placeholder="e.g. Lion"
            value={animalA}
            onChange={(e) => setAnimalA(e.target.value)}
          />
        </label>
        <span className="rr-slot-amp" aria-hidden="true">
          &amp;
        </span>
        <label className="rr-slot">
          <span className="rr-slot-label">Second contender</span>
          <input
            className="apex-field"
            type="text"
            placeholder="e.g. Tiger"
            value={animalB}
            onChange={(e) => setAnimalB(e.target.value)}
          />
        </label>
      </div>

      <fieldset className="rr-styles">
        <legend className="rr-styles-legend">Art style</legend>
        <div className="rr-chips">
          {ART_STYLE_OPTIONS.map((o) => (
            <label key={o.id} className={`rr-chip ${artStyle === o.id ? 'is-on' : ''}`}>
              <input
                className="rr-chip-input"
                type="radio"
                name="art-style"
                value={o.id}
                checked={artStyle === o.id}
                onChange={() => setArtStyle(o.id)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="rr-fierce">
        <input
          type="checkbox"
          checked={fierceMode}
          onChange={(e) => setFierceMode(e.target.checked)}
        />
        Fierce mode
      </label>

      {error && (
        <p className="rr-composer-error" role="alert">
          {error}
        </p>
      )}

      <button
        className="apex-btn rr-conjure"
        type="submit"
        disabled={submitting || !animalA.trim() || !animalB.trim()}
      >
        {submitting ? 'Conjuring...' : 'Conjure the book'}
      </button>
    </form>
  );

  if (variant === 'inline') {
    return <div className="rr-composer-inline">{form}</div>;
  }

  return (
    <div className="rr-overlay" data-testid="rr-scrim" onClick={onClose}>
      <div
        className="rr-overlay-card"
        role="dialog"
        aria-modal="true"
        aria-label="Begin a new matchup"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="rr-overlay-close" aria-label="Close" onClick={onClose}>
          &times;
        </button>
        {form}
      </div>
    </div>
  );
}
```

Note: the art-style radio inputs are styled visually as chips in Task 5 using a clip technique (NOT `display:none`), so they remain in the accessibility tree and keep their accessible name from the chip label text.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --prefix apex run test:run -- src/components/dashboard/MatchupComposer.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apex/src/types/artStyle.ts apex/src/components/dashboard/MatchupComposer.tsx apex/src/components/dashboard/MatchupComposer.test.tsx
git commit -m "feat(dashboard): add title-page MatchupComposer; rename Painterly"
```

---

## Task 3: Masthead component

Brand on the left; the "Begin a new matchup" stamp (shown only when `showCompose`) and the account menu on the right. The account menu reveals the email and a Sign out action, and closes on Escape or outside click.

**Files:**
- Create: `apex/src/components/dashboard/Masthead.tsx`
- Test: `apex/src/components/dashboard/Masthead.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apex/src/components/dashboard/Masthead.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Masthead } from './Masthead';

describe('Masthead', () => {
  it('renders the brand wordmark and kicker', () => {
    render(
      <Masthead email="reader@example.com" showCompose onCompose={vi.fn()} onSignOut={vi.fn()} />,
    );
    expect(screen.getByText('Who Would Win?')).toBeInTheDocument();
    expect(screen.getByText(/an apex publication/i)).toBeInTheDocument();
  });

  it('shows the compose stamp only when showCompose is true', async () => {
    const onCompose = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <Masthead email="reader@example.com" showCompose onCompose={onCompose} onSignOut={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: /begin a new matchup/i }));
    expect(onCompose).toHaveBeenCalledTimes(1);

    rerender(
      <Masthead
        email="reader@example.com"
        showCompose={false}
        onCompose={onCompose}
        onSignOut={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /begin a new matchup/i })).not.toBeInTheDocument();
  });

  it('opens the account menu and signs out', async () => {
    const onSignOut = vi.fn();
    const user = userEvent.setup();
    render(
      <Masthead
        email="reader@example.com"
        showCompose
        onCompose={vi.fn()}
        onSignOut={onSignOut}
      />,
    );

    await user.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apex run test:run -- src/components/dashboard/Masthead.test.tsx`
Expected: FAIL, cannot resolve `./Masthead`.

- [ ] **Step 3: Write minimal implementation**

Create `apex/src/components/dashboard/Masthead.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

export interface MastheadProps {
  email: string | null;
  showCompose: boolean;
  onCompose: () => void;
  onSignOut: () => void;
}

export function Masthead({ email, showCompose, onCompose, onSignOut }: MastheadProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const initial = email ? email.charAt(0).toUpperCase() : '&';

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header className="rr-masthead">
      <div className="rr-brand">
        <span className="apex-emblem rr-brand-emblem" aria-hidden="true">
          &amp;
        </span>
        <span className="rr-wordmark">
          <span className="rr-kicker">An Apex Publication</span>
          <span className="rr-brandname">Who Would Win?</span>
        </span>
      </div>

      <div className="rr-masthead-right">
        {showCompose && (
          <button type="button" className="apex-btn rr-new-matchup" onClick={onCompose}>
            <Plus size={16} /> Begin a new matchup
          </button>
        )}
        <div className="rr-account" ref={accountRef}>
          <button
            type="button"
            className="rr-avatar"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">{initial}</span>
            <span className="rr-sr-only">Account menu</span>
          </button>
          {menuOpen && (
            <div className="rr-menu" role="menu">
              {email && <p className="rr-menu-email">{email}</p>}
              <button
                type="button"
                className="rr-menu-item"
                role="menuitem"
                onClick={onSignOut}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apex run test:run -- src/components/dashboard/Masthead.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apex/src/components/dashboard/Masthead.tsx apex/src/components/dashboard/Masthead.test.tsx
git commit -m "feat(dashboard): add masthead with account menu"
```

---

## Task 4: Dashboard orchestrator rebuild

Rewire `Dashboard.tsx` to compose `Masthead`, the empty-state inline composer, the browse bar (search + sort), the gallery of `StoryCard`s, and the overlay composer. Preserve all data and Realtime logic and the `CatalogService` contract. Remove the inline sign-out chrome from `App.tsx` (the masthead now owns it). This task does NOT import `Dashboard.css` yet (that lands in Task 5) so the intermediate build stays green.

**Files:**
- Modify: `apex/src/components/dashboard/Dashboard.tsx`
- Modify: `apex/src/components/dashboard/Dashboard.test.tsx`
- Modify: `apex/src/App.tsx`

- [ ] **Step 1: Rewrite the test file**

Replace the entire contents of `apex/src/components/dashboard/Dashboard.test.tsx` with:

```tsx
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from './Dashboard';
import { createMockStoryRecord } from '../../test/fixtures';
import type { StoryChangeHandler } from '../../services/CatalogService';

// The Realtime handler captured from subscribeToStories so tests can dispatch
// fake postgres_changes payloads.
let realtimeHandler: StoryChangeHandler | null = null;

vi.mock('../../services/CatalogService', () => ({
  CatalogService: {
    listStories: vi.fn(),
    subscribeToStories: vi.fn(),
    createStory: vi.fn(),
    resolveSignedUrls: vi.fn(),
    deleteStory: vi.fn(),
  },
}));

const mockSignOut = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'owner-1', email: 'reader@example.com' },
    session: null,
    loading: false,
    signInWithEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: mockSignOut,
  }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: { removeChannel: vi.fn() },
}));

import { CatalogService } from '../../services/CatalogService';

const mockListStories = CatalogService.listStories as ReturnType<typeof vi.fn>;
const mockSubscribe = CatalogService.subscribeToStories as ReturnType<typeof vi.fn>;
const mockCreateStory = CatalogService.createStory as ReturnType<typeof vi.fn>;
const mockResolveSignedUrls = CatalogService.resolveSignedUrls as ReturnType<typeof vi.fn>;
const mockDeleteStory = CatalogService.deleteStory as ReturnType<typeof vi.fn>;

beforeEach(() => {
  realtimeHandler = null;
  mockListStories.mockReset();
  mockSubscribe.mockReset();
  mockCreateStory.mockReset();
  mockResolveSignedUrls.mockReset();
  mockDeleteStory.mockReset();
  mockSignOut.mockReset();

  mockListStories.mockResolvedValue([]);
  mockResolveSignedUrls.mockResolvedValue({});
  mockSubscribe.mockImplementation((_userId: string, handler: StoryChangeHandler) => {
    realtimeHandler = handler;
    return { unsubscribe: vi.fn() };
  });
});

function renderDashboard(onReadStory = vi.fn()) {
  return render(<Dashboard onReadStory={onReadStory} />);
}

function dispatchRealtime(payload: unknown) {
  act(() => {
    realtimeHandler?.(payload as Parameters<StoryChangeHandler>[0]);
  });
}

describe('Dashboard', () => {
  describe('empty state', () => {
    it('shows the inline composer when there are no stories', async () => {
      mockListStories.mockResolvedValue([]);
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByText(/conjure your first matchup/i)).toBeInTheDocument();
      });
      expect(screen.getByLabelText(/first contender/i)).toBeInTheDocument();
      // No compose stamp in the empty state (the composer is already the focus).
      expect(
        screen.queryByRole('button', { name: /begin a new matchup/i }),
      ).not.toBeInTheDocument();
    });

    it('subscribes to owner-filtered Realtime changes on mount', async () => {
      renderDashboard();
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalledWith('owner-1', expect.any(Function));
      });
    });
  });

  describe('compose', () => {
    it('calls createStory with the form values and resets the form (non-blocking)', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([]);
      mockCreateStory.mockResolvedValue('story-xyz');
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByLabelText(/first contender/i)).toBeInTheDocument();
      });

      const a = screen.getByLabelText(/first contender/i) as HTMLInputElement;
      const b = screen.getByLabelText(/second contender/i) as HTMLInputElement;
      await user.type(a, 'Lion');
      await user.type(b, 'Tiger');
      await user.click(screen.getByRole('radio', { name: /watercolor/i }));
      await user.click(screen.getByLabelText(/fierce mode/i));
      await user.click(screen.getByRole('button', { name: /conjure the book/i }));

      await waitFor(() => {
        expect(mockCreateStory).toHaveBeenCalledWith({
          animalA: 'Lion',
          animalB: 'Tiger',
          artStyle: 'watercolor',
          fierceMode: true,
        });
      });
      await waitFor(() => {
        expect(a).toHaveValue('');
        expect(b).toHaveValue('');
      });
      expect(screen.getByRole('radio', { name: /surprise me/i })).toBeChecked();
    });

    it('stays interactive while createStory is pending (no blocking overlay)', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([]);
      mockCreateStory.mockReturnValue(new Promise(() => {}));
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByLabelText(/first contender/i)).toBeInTheDocument();
      });
      await user.type(screen.getByLabelText(/first contender/i), 'Lion');
      await user.type(screen.getByLabelText(/second contender/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /conjure the book/i }));

      expect(screen.queryByText(/creating your book/i)).not.toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /surprise me/i })).toBeEnabled();
    });

    it('opens the composer overlay from the masthead stamp when a library exists', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([createMockStoryRecord()]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /begin a new matchup/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /begin a new matchup/i }));

      const dialog = screen.getByRole('dialog', { name: /begin a new matchup/i });
      expect(dialog).toBeInTheDocument();
      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('status-aware cards', () => {
    it('renders a ready row with cover, Read, and reveal-winner', async () => {
      mockListStories.mockResolvedValue([createMockStoryRecord()]);
      mockResolveSignedUrls.mockResolvedValue({
        'stories/story-1/cover.png': 'https://signed/cover.png',
      });
      const onReadStory = vi.fn();
      renderDashboard(onReadStory);

      await waitFor(() => {
        expect(screen.getByAltText('Lion vs Tiger')).toHaveAttribute('src', 'https://signed/cover.png');
      });
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /read the book/i }));
      expect(onReadStory).toHaveBeenCalledWith('story-1');
      await user.click(screen.getByRole('button', { name: /reveal winner/i }));
      expect(screen.getByText(/winner: lion/i)).toBeInTheDocument();
    });

    it('renders a failed row with its error and no Read', async () => {
      mockListStories.mockResolvedValue([
        createMockStoryRecord({
          id: 'fail-1',
          status: 'failed',
          title: null,
          manifest: null,
          cover_image_path: null,
          error: 'API quota exceeded',
        }),
      ]);
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByText(/api quota exceeded/i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /read the book/i })).not.toBeInTheDocument();
    });
  });

  describe('realtime transitions', () => {
    it('moves a row from generating to ready on a Realtime UPDATE', async () => {
      mockListStories.mockResolvedValue([
        createMockStoryRecord({
          id: 'story-1',
          status: 'generating',
          title: null,
          manifest: null,
          cover_image_path: null,
          progress_step: 'Writing the narrative...',
          progress_pct: 60,
        }),
      ]);
      mockResolveSignedUrls.mockResolvedValue({
        'stories/story-1/cover.png': 'https://signed/cover.png',
      });
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
      });
      dispatchRealtime({
        eventType: 'UPDATE',
        new: createMockStoryRecord({ id: 'story-1', status: 'ready' }),
        old: {},
      });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /read the book/i })).toBeInTheDocument();
      });
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('prepends a new row on a Realtime INSERT (deduped by id)', async () => {
      mockListStories.mockResolvedValue([createMockStoryRecord({ id: 'seed-1' })]);
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /begin a new matchup/i })).toBeInTheDocument();
      });

      const inserted = createMockStoryRecord({
        id: 'new-1',
        status: 'generating',
        title: null,
        manifest: null,
        cover_image_path: null,
        progress_step: 'Queued...',
        progress_pct: 0,
        animal_a: 'Eagle',
        animal_b: 'Hawk',
      });
      dispatchRealtime({ eventType: 'INSERT', new: inserted, old: {} });
      await waitFor(() => {
        expect(screen.getByText(/eagle vs hawk/i)).toBeInTheDocument();
      });
      dispatchRealtime({ eventType: 'INSERT', new: inserted, old: {} });
      expect(screen.getAllByText(/eagle vs hawk/i)).toHaveLength(1);
    });
  });

  describe('delete', () => {
    it('optimistically removes a story', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([createMockStoryRecord()]);
      mockResolveSignedUrls.mockResolvedValue({
        'stories/story-1/cover.png': 'https://signed/cover.png',
      });
      mockDeleteStory.mockReturnValue(new Promise(() => {}));
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Who Would Win? Lion vs. Tiger')).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /remove story/i }));
      await waitFor(() => {
        expect(screen.queryByText('Who Would Win? Lion vs. Tiger')).not.toBeInTheDocument();
      });
      expect(mockDeleteStory).toHaveBeenCalledWith('story-1');
    });
  });

  describe('browse', () => {
    it('filters by contender name and sorts', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([
        createMockStoryRecord({ id: 's1', title: 'Lion vs Tiger', animal_a: 'Lion', animal_b: 'Tiger', cover_image_path: null }),
        createMockStoryRecord({ id: 's2', title: 'Orca vs Shark', animal_a: 'Orca', animal_b: 'Shark', cover_image_path: null }),
      ]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Orca vs Shark')).toBeInTheDocument();
      });
      await user.type(screen.getByLabelText(/search by name/i), 'orca');
      expect(screen.queryByText('Lion vs Tiger')).not.toBeInTheDocument();
      expect(screen.getByText('Orca vs Shark')).toBeInTheDocument();
    });
  });

  describe('account', () => {
    it('signs out from the masthead account menu', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([]);
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /account menu/i }));
      await user.click(screen.getByRole('menuitem', { name: /sign out/i }));
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('provider/model picker removal', () => {
    it('does not render any LLM/image provider or model selector', async () => {
      mockListStories.mockResolvedValue([]);
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByText(/conjure your first matchup/i)).toBeInTheDocument();
      });
      expect(screen.queryByLabelText(/llm provider/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/image provider/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/image model/i)).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix apex run test:run -- src/components/dashboard/Dashboard.test.tsx`
Expected: FAIL (the current `Dashboard` renders the old markup; queries like `first contender`, `begin a new matchup`, `account menu` are not found).

- [ ] **Step 3: Rewrite the Dashboard implementation**

Replace the entire contents of `apex/src/components/dashboard/Dashboard.tsx` with:

```tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Search } from 'lucide-react';
import { StoryRecord } from '../../types/story.types';
import { CatalogService, CreateStoryInput } from '../../services/CatalogService';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Masthead } from './Masthead';
import { MatchupComposer } from './MatchupComposer';
import { StoryCard } from './StoryCard';

type SortOrder = 'newest' | 'oldest' | 'az';

function sortKey(story: StoryRecord): string {
  return story.title ?? `${story.animal_a} vs ${story.animal_b}`;
}

export const Dashboard: React.FC<{ onReadStory: (id: string) => void }> = ({ onReadStory }) => {
  const { user, signOut } = useAuth();
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [revealedWinners, setRevealedWinners] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [composerOpen, setComposerOpen] = useState(false);

  const toggleWinnerReveal = useCallback((id: string) => {
    setRevealedWinners((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Reconcile a Realtime postgres_changes payload into local state.
  const onChange = useCallback(
    (payload: import('@supabase/supabase-js').RealtimePostgresChangesPayload<StoryRecord>) => {
      setStories((prev) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const row = payload.new as StoryRecord;
          if (prev.some((s) => s.id === row.id)) {
            return prev.map((s) => (s.id === row.id ? row : s));
          }
          return [row, ...prev];
        }
        if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as Partial<StoryRecord>).id;
          return prev.filter((s) => s.id !== oldId);
        }
        return prev;
      });
    },
    [],
  );

  const loadStories = useCallback(async () => {
    const data = await CatalogService.listStories();
    setStories(data);
  }, []);

  // Initial load + owner-filtered Realtime subscription.
  useEffect(() => {
    loadStories();
    if (!user) return;
    const channel = CatalogService.subscribeToStories(user.id, onChange);
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, onChange, loadStories]);

  // Batch-resolve signed cover URLs for ready rows with a cover path.
  const readyCoverPaths = useMemo(
    () =>
      stories
        .filter((s) => s.status === 'ready' && s.cover_image_path)
        .map((s) => s.cover_image_path as string),
    [stories],
  );

  useEffect(() => {
    if (readyCoverPaths.length === 0) return;
    let cancelled = false;
    CatalogService.resolveSignedUrls(readyCoverPaths).then((map) => {
      if (!cancelled) setCoverUrls((prev) => ({ ...prev, ...map }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyCoverPaths.join(',')]);

  // Non-blocking submit; the new generating row arrives via Realtime.
  const handleCreate = useCallback(async (input: CreateStoryInput) => {
    await CatalogService.createStory(input);
    setComposerOpen(false);
  }, []);

  // Optimistic delete with reload-on-failure.
  const handleDelete = useCallback(
    async (id: string) => {
      setStories((prev) => prev.filter((s) => s.id !== id));
      try {
        await CatalogService.deleteStory(id);
      } catch (error) {
        console.error('[Dashboard] Delete failed:', error);
        await loadStories();
      }
    },
    [loadStories],
  );

  const visibleStories = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = stories;
    if (q) {
      list = list.filter(
        (s) =>
          s.animal_a.toLowerCase().includes(q) ||
          s.animal_b.toLowerCase().includes(q) ||
          (s.title ?? '').toLowerCase().includes(q),
      );
    }
    const sorted = [...list];
    if (sort === 'newest') {
      sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else if (sort === 'oldest') {
      sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    } else {
      sorted.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    }
    return sorted;
  }, [stories, search, sort]);

  const isEmpty = stories.length === 0;

  return (
    <div className="rr">
      <Masthead
        email={user?.email ?? null}
        showCompose={!isEmpty}
        onCompose={() => setComposerOpen(true)}
        onSignOut={signOut}
      />

      {isEmpty ? (
        <section className="rr-empty">
          <p className="rr-empty-welcome">Conjure your first matchup.</p>
          <MatchupComposer variant="inline" onCreate={handleCreate} />
        </section>
      ) : (
        <>
          <div className="rr-browse">
            <h2 className="rr-shelf-title">
              Your Library <span>{stories.length} {stories.length === 1 ? 'book' : 'books'}</span>
            </h2>
            <div className="rr-browse-controls">
              <div className="rr-search">
                <Search size={15} aria-hidden="true" />
                <label className="rr-sr-only" htmlFor="rr-search-input">
                  Search by name
                </label>
                <input
                  id="rr-search-input"
                  type="search"
                  placeholder="Search by name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <label className="rr-sr-only" htmlFor="rr-sort">
                Sort
              </label>
              <select
                id="rr-sort"
                className="rr-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOrder)}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="az">A to Z</option>
              </select>
            </div>
          </div>

          {visibleStories.length === 0 ? (
            <p className="rr-no-results">No matchups match that search.</p>
          ) : (
            <div className="rr-gallery">
              {visibleStories.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  coverUrl={story.cover_image_path ? coverUrls[story.cover_image_path] : undefined}
                  isWinnerRevealed={revealedWinners.has(story.id)}
                  onToggleWinner={toggleWinnerReveal}
                  onReadStory={onReadStory}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {composerOpen && (
            <MatchupComposer
              variant="overlay"
              onCreate={handleCreate}
              onClose={() => setComposerOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Remove the inline sign-out chrome from App.tsx**

In `apex/src/App.tsx`, change the `AppContent` function. Replace:

```tsx
function AppContent() {
  const { user, loading, signOut } = useAuth();
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);

  if (loading) return null;

  if (!user) return <SignIn />;

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.5rem 1rem' }}>
        <button onClick={signOut}>Sign out</button>
      </div>
      {currentStoryId ? (
        <Suspense fallback={<div>Loading book...</div>}>
          <BookViewer storyId={currentStoryId} onClose={() => setCurrentStoryId(null)} />
        </Suspense>
      ) : (
        <Dashboard onReadStory={setCurrentStoryId} />
      )}
    </main>
  );
}
```

with:

```tsx
function AppContent() {
  const { user, loading } = useAuth();
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);

  if (loading) return null;

  if (!user) return <SignIn />;

  return (
    <main>
      {currentStoryId ? (
        <Suspense fallback={<div>Loading book...</div>}>
          <BookViewer storyId={currentStoryId} onClose={() => setCurrentStoryId(null)} />
        </Suspense>
      ) : (
        <Dashboard onReadStory={setCurrentStoryId} />
      )}
    </main>
  );
}
```

- [ ] **Step 5: Run the Dashboard tests to verify they pass**

Run: `npm --prefix apex run test:run -- src/components/dashboard/Dashboard.test.tsx`
Expected: PASS (all describe blocks).

- [ ] **Step 6: Run the full app test suite to check for fallout**

Run: `npm --prefix apex run test:run`
Expected: PASS. (If a `BookViewer` or `App` test referenced the old inline "Sign out" button, update that assertion to reflect that sign-out now lives in the dashboard masthead. Investigate any failure before proceeding.)

- [ ] **Step 7: Commit**

```bash
git add apex/src/components/dashboard/Dashboard.tsx apex/src/components/dashboard/Dashboard.test.tsx apex/src/App.tsx
git commit -m "feat(dashboard): rebuild dashboard as the Reading Room"
```

---

## Task 5: Reading Room stylesheet

Create `Dashboard.css` on `--apex-*` tokens and import it once from `Dashboard.tsx`. This is the visual heart: paper page, masthead, browse bar, clean gallery, the three card states (including the on-the-press sweep and develop-in), the title-page composer (inline and overlay), the empty state, responsive rules, and reduced-motion gating. No unit tests; verified by build and by screenshots in Task 7.

**Files:**
- Create: `apex/src/components/dashboard/Dashboard.css`
- Modify: `apex/src/components/dashboard/Dashboard.tsx` (add the import)

- [ ] **Step 1: Create the stylesheet**

Create `apex/src/components/dashboard/Dashboard.css`:

```css
/* The Reading Room: the logged-in dashboard. Built on the --apex-* system. */

.rr {
  min-height: 100vh;
  color: var(--apex-ink);
  font-family: var(--apex-font-ui);
  background:
    radial-gradient(130% 100% at 50% -10%,
      var(--apex-paper-hi) 0%, var(--apex-paper) 78%, var(--apex-paper-lo) 100%);
  background-attachment: fixed;
  position: relative;
}

.rr::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.5;
  z-index: 0;
  background-image:
    radial-gradient(circle at 12% 20%, rgba(120, 90, 40, 0.05) 0 1px, transparent 1px),
    radial-gradient(circle at 70% 60%, rgba(120, 90, 40, 0.04) 0 1px, transparent 1px);
  background-size: 7px 7px, 11px 11px;
}

.rr > * { position: relative; z-index: 1; }

.rr-sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0);
  white-space: nowrap; border: 0;
}

/* ---- Masthead ---- */
.rr-masthead {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem clamp(1rem, 4vw, 2.2rem);
  border-bottom: 1px solid var(--apex-rule);
}

.rr-brand { display: flex; align-items: center; gap: 0.7rem; }
.rr-brand-emblem { width: 38px; height: 38px; font-size: 1.25rem; }
.rr-wordmark { display: flex; flex-direction: column; line-height: 1.05; }
.rr-kicker {
  font-size: 0.6rem; font-weight: 700; letter-spacing: 0.16em;
  text-transform: uppercase; color: #a8854a;
}
.rr-brandname { font-family: var(--apex-font-display); font-weight: 700; font-size: 1.2rem; color: var(--apex-ink); }

.rr-masthead-right { margin-left: auto; display: flex; align-items: center; gap: 0.9rem; }

/* the .apex-btn primitive is full-width; the masthead stamp is auto-width */
.rr-new-matchup {
  width: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.6rem 1rem;
  font-size: 0.9rem;
  box-shadow: 0 3px 10px rgba(62, 107, 74, 0.25);
}

.rr-account { position: relative; }
.rr-avatar {
  width: 38px; height: 38px; border-radius: 50%;
  background: linear-gradient(150deg, #e4d6b4, #cdb98a);
  border: 1px solid var(--apex-field-border);
  color: var(--apex-brown);
  font-family: var(--apex-font-display);
  font-size: 1rem;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.rr-avatar:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); }

.rr-menu {
  position: absolute; right: 0; top: calc(100% + 8px);
  min-width: 200px;
  background: var(--apex-surface);
  border: 1px solid var(--apex-field-border);
  border-radius: var(--apex-radius);
  box-shadow: 0 12px 30px rgba(40, 25, 10, 0.18);
  padding: 0.5rem;
  z-index: 20;
}
.rr-menu-email {
  font-size: 0.78rem; color: var(--apex-brown);
  padding: 0.35rem 0.5rem 0.5rem;
  border-bottom: 1px solid var(--apex-rule);
  word-break: break-all;
}
.rr-menu-item {
  width: 100%; text-align: left;
  padding: 0.55rem 0.5rem; margin-top: 0.3rem;
  border-radius: 7px;
  font-size: 0.9rem; font-weight: 600; color: var(--apex-ink-soft);
  background: none; cursor: pointer;
}
.rr-menu-item:hover { background: #fffdf7; color: var(--apex-ink); }
.rr-menu-item:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); }

/* ---- Browse bar ---- */
.rr-browse {
  display: flex; align-items: flex-end; justify-content: space-between;
  flex-wrap: wrap; gap: 0.9rem;
  padding: clamp(1.4rem, 3vw, 2rem) clamp(1rem, 4vw, 2.2rem) 1rem;
}
.rr-shelf-title { font-family: var(--apex-font-display); font-size: 1.55rem; font-weight: 700; color: var(--apex-ink); }
.rr-shelf-title span { font-family: var(--apex-font-ui); font-size: 0.85rem; font-weight: 400; color: var(--apex-brown-mute); margin-left: 0.4rem; }

.rr-browse-controls { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.rr-search {
  display: flex; align-items: center; gap: 0.5rem;
  background: var(--apex-surface);
  border: 1px solid var(--apex-field-border);
  border-radius: var(--apex-radius);
  padding: 0.5rem 0.75rem;
  color: var(--apex-brown-mute);
}
.rr-search input {
  border: none; background: none; outline: none;
  font-family: var(--apex-font-ui); font-size: 0.9rem; color: var(--apex-ink);
  min-width: 9rem;
}
.rr-search:focus-within { border-color: var(--apex-forest); box-shadow: 0 0 0 3px var(--apex-focus); }
.rr-sort {
  font-family: var(--apex-font-ui); font-size: 0.9rem; font-weight: 600; color: var(--apex-ink-soft);
  background: var(--apex-surface);
  border: 1px solid var(--apex-field-border);
  border-radius: var(--apex-radius);
  padding: 0.5rem 0.75rem; cursor: pointer;
}
.rr-sort:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); }

.rr-no-results { padding: 2rem clamp(1rem, 4vw, 2.2rem); color: var(--apex-brown); font-style: italic; }

/* ---- Gallery ---- */
.rr-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: clamp(1.3rem, 2.5vw, 1.7rem);
  padding: 0.5rem clamp(1rem, 4vw, 2.2rem) 3rem;
}

.rr-card { display: flex; flex-direction: column; }
.rr-cover {
  position: relative;
  aspect-ratio: 3 / 4;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(120, 80, 30, 0.22);
  box-shadow: 0 9px 22px rgba(90, 60, 20, 0.15);
  background: linear-gradient(160deg, #efe3c5, #e2d1a8);
}
.rr-cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

.rr-card-actions {
  position: absolute; left: 8px; right: 8px; bottom: 8px;
  display: flex; gap: 7px;
  opacity: 0;
  transition: opacity 0.18s var(--apex-ease);
}
.rr-card:hover .rr-card-actions,
.rr-card:focus-within .rr-card-actions { opacity: 1; }
.rr-read {
  flex: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
  background: var(--apex-forest); color: var(--apex-on-forest);
  border-radius: 7px; padding: 0.55rem; font-size: 0.82rem; font-weight: 700;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2); cursor: pointer;
}
.rr-read:hover { background: var(--apex-forest-deep); }
.rr-remove {
  width: 36px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(253, 250, 241, 0.92);
  border: 1px solid var(--apex-field-border);
  border-radius: 7px; color: var(--apex-brown-mute); cursor: pointer;
}
.rr-remove:hover { color: var(--apex-error); border-color: var(--apex-error); }
.rr-read:focus-visible, .rr-remove:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); }

.rr-meta { margin-top: 0.6rem; }
.rr-title {
  font-family: var(--apex-font-display); font-size: 0.98rem; font-weight: 700; color: var(--apex-ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rr-date { font-size: 0.72rem; color: var(--apex-brown-mute); margin-top: 0.1rem; }

.rr-reveal, .rr-winner {
  display: inline-flex; align-items: center; gap: 0.35rem;
  margin-top: 0.5rem; padding: 0.3rem 0.7rem;
  border-radius: 20px; font-size: 0.76rem; font-weight: 700; cursor: pointer;
}
.rr-reveal { background: var(--apex-surface); border: 1px solid var(--apex-field-border); color: var(--apex-brown); }
.rr-reveal:hover { border-color: var(--apex-rule); color: var(--apex-ink-soft); }
.rr-winner {
  background: rgba(62, 107, 74, 0.12);
  border: 1px solid rgba(62, 107, 74, 0.3);
  color: var(--apex-forest);
}
.rr-reveal:focus-visible, .rr-winner:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); }

/* generating: on the press */
.rr-card--generating .rr-cover { background: linear-gradient(160deg, #cfe0d6, #6f9b78); }
.rr-press { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.rr-press-amp { font-family: var(--apex-font-display); font-size: 1.9rem; color: var(--apex-gilt); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); }
.rr-sweep {
  position: absolute; top: 0; bottom: 0; width: 42%; left: -42%;
  background: linear-gradient(100deg, transparent, rgba(255, 250, 230, 0.7), transparent);
  transform: skewX(-12deg);
}
.rr-progress { position: absolute; left: 9px; right: 9px; bottom: 10px; }
.rr-ptrack { height: 5px; background: rgba(255, 255, 255, 0.35); border-radius: 3px; overflow: hidden; }
.rr-pbar { height: 100%; background: linear-gradient(90deg, var(--apex-paper-hi), #cfe6d2); border-radius: 3px; transition: width 0.4s var(--apex-ease); }
.rr-pstep { font-size: 0.66rem; color: #f3fff4; margin-top: 0.3rem; text-align: center; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }
.rr-press-cap {
  position: absolute; top: 8px; left: 0; right: 0; text-align: center;
  font-size: 0.58rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(255, 252, 240, 0.85);
}

/* failed */
.rr-card--failed .rr-cover { filter: grayscale(0.7) brightness(0.96); }
.rr-failed { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: linear-gradient(160deg, rgba(60, 50, 40, 0.12), rgba(60, 50, 40, 0.32)); }
.rr-fail-mark {
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(162, 59, 42, 0.92); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--apex-font-display); font-weight: 800;
}
.rr-error { display: flex; align-items: flex-start; gap: 0.3rem; font-size: 0.76rem; color: var(--apex-error); margin-top: 0.45rem; line-height: 1.35; }
.rr-remove-text {
  margin-top: 0.45rem; padding: 0.3rem 0.7rem;
  border: 1px solid var(--apex-field-border); border-radius: 7px;
  font-size: 0.76rem; font-weight: 600; color: var(--apex-brown-mute);
  background: var(--apex-surface); cursor: pointer;
}
.rr-remove-text:hover { color: var(--apex-error); border-color: var(--apex-error); }
.rr-remove-text:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); }

/* ---- Empty state ---- */
.rr-empty {
  max-width: 420px; margin: 0 auto;
  padding: clamp(2rem, 6vw, 4rem) 1.5rem;
  display: flex; flex-direction: column; align-items: center; text-align: center;
}
.rr-empty-welcome {
  font-family: var(--apex-font-serif); font-style: italic;
  font-size: 1.25rem; color: var(--apex-brown); margin-bottom: 1.2rem;
}

/* ---- Composer (shared form) ---- */
.rr-composer-inline { width: 100%; max-width: 400px; }
.rr-composer {
  background: var(--apex-surface);
  border: 1px solid var(--apex-field-border);
  border-radius: var(--apex-radius);
  padding: 1.5rem 1.6rem;
  display: flex; flex-direction: column;
}
.rr-composer-emblem { width: 48px; height: 48px; font-size: 1.55rem; align-self: center; margin-bottom: 0.7rem; }
.rr-composer-kick {
  text-align: center; text-transform: uppercase; letter-spacing: 0.14em;
  font-size: 0.68rem; font-weight: 700; color: #a8854a; margin-bottom: 1rem;
}
.rr-slots { display: flex; align-items: flex-end; gap: 0.7rem; margin-bottom: 1rem; }
.rr-slot { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; text-align: left; }
.rr-slot-label { font-size: 0.72rem; font-weight: 600; color: var(--apex-brown); }
.rr-slot-amp { font-family: var(--apex-font-display); color: var(--apex-gilt); font-size: 1.6rem; padding-bottom: 0.4rem; }

.rr-styles { border: none; margin-bottom: 0.9rem; }
.rr-styles-legend { font-size: 0.72rem; font-weight: 600; color: var(--apex-brown); margin-bottom: 0.5rem; }
.rr-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.rr-chip { position: relative; cursor: pointer; }
/* clip the input (keeps it in the a11y tree; do NOT use display:none) */
.rr-chip-input {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.rr-chip span {
  display: inline-block;
  padding: 0.32rem 0.7rem; border-radius: 20px;
  border: 1px solid var(--apex-field-border);
  background: #fff; color: var(--apex-brown); font-size: 0.78rem; font-weight: 600;
  transition: background 0.15s var(--apex-ease), color 0.15s var(--apex-ease), border-color 0.15s var(--apex-ease);
}
.rr-chip.is-on span { background: var(--apex-forest); color: var(--apex-on-forest); border-color: var(--apex-forest); }
.rr-chip-input:focus-visible + span { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); }

.rr-fierce { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--apex-ink-soft); margin-bottom: 1rem; cursor: pointer; }
.rr-composer-error { font-size: 0.8rem; color: var(--apex-error); margin-bottom: 0.7rem; }
.rr-conjure { margin-top: 0.2rem; }

/* ---- Composer overlay ---- */
.rr-overlay {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center;
  padding: 1.2rem;
  background: rgba(42, 32, 24, 0.34);
  animation: rrScrimIn 0.2s var(--apex-ease);
}
.rr-overlay-card {
  position: relative;
  width: 100%; max-width: 380px;
  border: 1px solid var(--apex-rule);
  border-radius: var(--apex-radius);
  box-shadow: 0 22px 60px rgba(40, 25, 10, 0.28);
}
.rr-overlay-card::before {
  content: ''; position: absolute; inset: 6px;
  border: 1px solid var(--apex-gilt); border-radius: 5px; opacity: 0.5; pointer-events: none;
}
.rr-overlay-close {
  position: absolute; top: 8px; right: 12px; z-index: 2;
  font-size: 1.3rem; line-height: 1; color: var(--apex-brown-mute);
  background: none; cursor: pointer;
}
.rr-overlay-close:hover { color: var(--apex-ink); }
.rr-overlay-close:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); border-radius: 4px; }

/* ---- Responsive ---- */
@media (max-width: 560px) {
  .rr-kicker { display: none; }
  .rr-new-matchup span { display: none; }
  .rr-slots { flex-direction: column; align-items: stretch; }
  .rr-slot-amp { align-self: center; padding: 0; }
}

/* ---- Motion ---- */
@media (prefers-reduced-motion: no-preference) {
  .rr-gallery .rr-card {
    opacity: 0;
    transform: translateY(8px);
    animation: rrCardRise 0.5s var(--apex-ease) forwards;
  }
  .rr-card--ready .rr-cover-img { animation: rrDevelopIn 0.6s var(--apex-ease); }
  .rr-sweep { animation: rrSweep 1.8s var(--apex-ease) infinite; }
  .rr-winner { animation: rrPop 0.3s var(--apex-ease); }

  @keyframes rrCardRise { to { opacity: 1; transform: translateY(0); } }
  @keyframes rrDevelopIn { from { opacity: 0; filter: saturate(0.4) blur(4px); } to { opacity: 1; filter: none; } }
  @keyframes rrSweep { from { left: -42%; } to { left: 110%; } }
  @keyframes rrPop { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes rrScrimIn { from { opacity: 0; } to { opacity: 1; } }
}
```

- [ ] **Step 2: Import the stylesheet from Dashboard.tsx**

In `apex/src/components/dashboard/Dashboard.tsx`, add the CSS import directly below the `StoryCard` import near the top:

```tsx
import { StoryCard } from './StoryCard';
import './Dashboard.css';
```

- [ ] **Step 3: Verify the build and tests still pass**

Run: `npm --prefix apex run build`
Expected: build succeeds with no errors.

Run: `npm --prefix apex run test:run`
Expected: PASS (styling does not change behavior; jsdom ignores CSS).

- [ ] **Step 4: Commit**

```bash
git add apex/src/components/dashboard/Dashboard.css apex/src/components/dashboard/Dashboard.tsx
git commit -m "style(dashboard): add Reading Room stylesheet on apex tokens"
```

---

## Task 6: Remove dashboard-only legacy CSS and tokens

Delete the old dashboard styles and the four dashboard-only legacy tokens from the global `index.css`. Keep every token still referenced by `BookViewer`, `App.css`, or the body default font.

**Files:**
- Modify: `apex/src/index.css`

- [ ] **Step 1: Delete the dashboard style blocks**

In `apex/src/index.css`, delete every rule from the `/* Dashboard Container */` comment (the `.dashboard-container` block, around line 209) through the end of the file, which covers: `.dashboard-container`, `.dashboard-header*`, `.generator-section*`, `.advanced-options*`, `.provider-selector*`, `.generator-form`, `.input-group*`, `.input-icon`, `.vs-badge`, `.generate-btn*`, `.stories-section*`, `.empty-state`, `.empty-icon`, `.story-grid`, `.story-card*`, `.custom-cover*`, `.cover-*`, `.story-info*`, `.winner-badge*`, `.reveal-winner-btn*`, `.card-actions`, `.read-btn*`, `.delete-btn*`, the `@keyframes revealFade` / `pulse-danger`, the entire `.generation-*` overlay block and its keyframes, and the trailing `@media (max-width: 768px)` block (which only adjusts those dashboard classes).

Keep everything above that comment: the legacy `:root`, the Apex `:root`, the `.apex-*` primitives, the global `*`, `body`, `#root`, and `button` resets.

- [ ] **Step 2: Remove the four dashboard-only legacy tokens**

In the legacy `:root` at the top of `apex/src/index.css`, delete these four lines (they are no longer referenced after Step 1):

```css
  --bg-secondary: #161b22;
  --bg-card-hover: #22272e;
  --danger-color: #f85149;
  --danger-hover: #ff6a63;
```

Keep all other legacy tokens: `--bg-color`, `--bg-card`, `--text-primary`, `--text-secondary`, `--accent-color`, `--accent-hover`, `--vs-color`, `--border-color`, `--border-focus`, `--shadow-sm`, `--shadow-lg`, `--radius`, `--font-family`, `--transition` (all still used by `BookViewer`, `App.css`, or the body font).

- [ ] **Step 3: Verify nothing references the deleted tokens or classes**

Run: `grep -rnE "bg-secondary|bg-card-hover|danger-color|danger-hover|dashboard-container|generator-section|story-card|generation-overlay|vs-badge|generate-btn" apex/src`
Expected: no output (no remaining references).

If any reference remains (for example in a stray test), investigate it before continuing rather than re-adding the token.

- [ ] **Step 4: Verify build and tests**

Run: `npm --prefix apex run build && npm --prefix apex run test:run`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add apex/src/index.css
git commit -m "refactor(css): remove dashboard-only legacy tokens and classes"
```

---

## Task 7: Full verification and visual confirmation

Run the complete gate and drive the real app to confirm every state renders correctly with no console errors.

**Files:** none (verification only).

- [ ] **Step 1: Run the full verification gate**

Run: `npm --prefix apex run lint`
Expected: no errors.

Run: `npm --prefix apex run build`
Expected: succeeds.

Run: `npm --prefix apex run test:run`
Expected: all suites pass.

- [ ] **Step 2: Confirm no em dashes were introduced**

Run: `grep -rn "$(printf '\u2014')" apex/src/components/dashboard docs/specs/2026-06-15-dashboard-bookshelf.md docs/plans/2026-06-15-dashboard-bookshelf.md`
Expected: no output.

- [ ] **Step 3: Drive the running app and screenshot each state**

Start the dev server: `npm --prefix apex run dev` (serves `http://localhost:5173/`; `apex/.env` already exists).

Using the `playwright-cli` skill, sign in (or mock auth as the tests do) and capture screenshots, confirming zero console errors on each:
- Empty state (inline composer + welcome).
- Composer overlay (open from the masthead stamp), including Escape and scrim dismiss.
- A generating card (on-the-press sweep + progress); if no live generation is handy, trigger one via the composer.
- A ready card (cover, hover actions, reveal-winner toggling to the winner pill).
- A failed card (grayed cover, error, Remove).
- Search filtering and each sort order.
- Mobile width (around 390px): masthead, stacked composer slots, single-column gallery.

- [ ] **Step 4: Confirm reduced-motion**

In the browser devtools, emulate `prefers-reduced-motion: reduce` and confirm the gallery, sweep, develop-in, and winner-pop animations do not run and content renders in final position.

- [ ] **Step 5: Final review**

If everything passes and looks right, the branch `redesign/apex-dashboard` is ready to integrate (use the `superpowers:finishing-a-development-branch` skill to decide merge vs PR). If anything is off, fix it under the relevant task before integrating.

---

## Self-Review Notes

- **Spec coverage:** Reading Room IA (Task 4), masthead + account chrome (Task 3, App.tsx in Task 4), clean gallery (Tasks 1 + 5), search/sort (Task 4), title-page overlay composer + chips + Painterly rename (Task 2), empty-state inline composer (Task 4), three card states incl. on-the-press and develop-in (Tasks 1 + 5), reveal-winner (Task 1), accessibility (labels, radiogroup, focus rings, progressbar, alert, reduced motion across Tasks 1-5), responsive (Task 5), component split + Dashboard.css (Tasks 1-5), token/CSS migration keeping BookViewer's tokens (Task 6), preserved behavioral contract (Task 4), test rewrite (Tasks 1-4), verification incl. screenshots (Task 7). All spec sections map to a task.
- **Type consistency:** `CreateStoryInput` (from `CatalogService`) is used by `MatchupComposer.onCreate` and `Dashboard.handleCreate`. `StoryCardProps`, `MatchupComposerProps`, and `MastheadProps` are defined once and consumed consistently. `winnerLabel` is defined and exported in `StoryCard.tsx` and used there. `SortOrder` is local to `Dashboard.tsx`.
- **No placeholders:** every code and command step contains complete content.
