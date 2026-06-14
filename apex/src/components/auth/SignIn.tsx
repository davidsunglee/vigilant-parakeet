import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './SignIn.css';

export function SignIn() {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    await signInWithEmail(email);
    setSent(true);
  }

  return (
    <div className="sign-in">
      <h1 className="sign-in__title">Sign in</h1>

      {sent ? (
        <p className="sign-in__confirmation">Check your email for a magic link.</p>
      ) : (
        <form className="sign-in__form" onSubmit={handleMagicLink}>
          <input
            className="sign-in__input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="sign-in__button" type="submit">
            Send magic link
          </button>
        </form>
      )}

      <div className="sign-in__divider">or</div>

      <button className="sign-in__button sign-in__button--google" onClick={signInWithGoogle}>
        Continue with Google
      </button>
    </div>
  );
}
