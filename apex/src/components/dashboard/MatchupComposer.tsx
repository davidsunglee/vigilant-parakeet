import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
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
  const [artStyle, setArtStyle] = useState<ArtStyleId>(ART_STYLE_OPTIONS[0].id);
  const [fierceMode, setFierceMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Focus the first field on mount. For the overlay, remember whatever had
  // focus (the stamp that opened it) and restore it when the overlay closes.
  useEffect(() => {
    const opener = variant === 'overlay' ? (document.activeElement as HTMLElement | null) : null;
    firstFieldRef.current?.focus();
    return () => opener?.focus?.();
  }, [variant]);

  // Keep Tab focus inside the overlay dialog (a modal focus trap).
  function trapFocus(e: ReactKeyboardEvent) {
    if (e.key !== 'Tab' || !cardRef.current) return;
    const focusable = cardRef.current.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

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
    setArtStyle(ART_STYLE_OPTIONS[0].id);
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
                aria-label={o.label}
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
        ref={cardRef}
        className="rr-overlay-card"
        role="dialog"
        aria-modal="true"
        aria-label="Begin a new matchup"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapFocus}
      >
        <button type="button" className="rr-overlay-close" aria-label="Close" onClick={onClose}>
          &times;
        </button>
        {form}
      </div>
    </div>
  );
}
