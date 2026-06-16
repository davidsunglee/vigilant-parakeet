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
            <Plus size={16} aria-hidden="true" /> <span>Begin a new matchup</span>
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
            <div className="rr-menu">
              {email && <p className="rr-menu-email">{email}</p>}
              <div role="menu">
                <button
                  type="button"
                  className="rr-menu-item"
                  role="menuitem"
                  onClick={onSignOut}
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
