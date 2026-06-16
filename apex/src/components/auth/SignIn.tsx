import { useState } from 'react';
import { Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './SignIn.css';

type Status = 'idle' | 'sending' | 'sent' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_ERROR = 'Something went wrong sending your link. Please try again.';

export function SignIn() {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setStatus('error');
      setError('That address does not look right.');
      return;
    }
    setStatus('sending');
    setError(null);
    try {
      await signInWithEmail(trimmed);
      setStatus('sent');
    } catch {
      setStatus('error');
      setError(GENERIC_ERROR);
    }
  }

  async function handleGoogle() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch {
      setStatus('error');
      setError(GENERIC_ERROR);
    }
  }

  function useDifferentEmail() {
    setEmail('');
    setError(null);
    setStatus('idle');
  }

  const sending = status === 'sending';

  return (
    <main className="signin">
      <div className="signin__frame" aria-hidden="true" />

      <section className="signin__card">
        <div className="apex-emblem signin__emblem" aria-hidden="true">&amp;</div>
        <p className="signin__kicker">An Apex Publication</p>
        <h1 className="signin__title">
          Who Would <em>Win?</em>
        </h1>

        {status === 'sent' ? (
          <div className="signin__sent" role="status">
            <span className="signin__seal" aria-hidden="true">
              <Check size={22} strokeWidth={2.5} />
            </span>
            <p className="signin__sent-head">Check your inbox</p>
            <p className="signin__sent-body">
              We sent a magic link to <strong>{email.trim()}</strong>. Open it on this
              device to step inside.
            </p>
            <button type="button" className="signin__textlink" onClick={useDifferentEmail}>
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <p className="signin__subtitle">
              Conjure an illustrated showdown between any two things, then find out who
              would win.
            </p>

            <form className="signin__form" onSubmit={handleMagicLink} noValidate>
              <label className="signin__sr-only" htmlFor="signin-email">
                Email address
              </label>
              <input
                id="signin-email"
                className="apex-field"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={sending}
                required
                aria-invalid={status === 'error' && !!error ? true : undefined}
                aria-describedby={error ? 'signin-error' : undefined}
              />
              {error && (
                <p className="signin__error" id="signin-error" role="alert">
                  {error}
                </p>
              )}
              <button className="apex-btn" type="submit" disabled={sending}>
                {sending ? 'Sending the link...' : 'Send me a magic link'}
              </button>
            </form>

            <div className="apex-divider signin__divider">
              <span>or</span>
            </div>

            <button
              type="button"
              className="apex-btn apex-btn--ghost signin__google"
              onClick={handleGoogle}
              disabled={sending}
            >
              <GoogleGlyph />
              Continue with Google
            </button>

            <p className="signin__foot">
              No password. The same link signs you in or signs you up.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg
      className="signin__g"
      width="17"
      height="17"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
