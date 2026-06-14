import { render, screen, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import type { User, Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from './AuthContext';

// --- Mock supabase ---

const {
  mockUnsubscribe,
  mockGetSession,
  mockOnAuthStateChange,
  mockSignInWithOtp,
  mockSignInWithOAuth,
  mockSignOut,
} = vi.hoisted(() => ({
  mockUnsubscribe: vi.fn(),
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockSignInWithOtp: vi.fn(),
  mockSignInWithOAuth: vi.fn(),
  mockSignOut: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signInWithOtp: mockSignInWithOtp,
      signInWithOAuth: mockSignInWithOAuth,
      signOut: mockSignOut,
    },
  },
}));

const mockUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00Z',
};

const mockSession: Session = {
  access_token: 'token',
  refresh_token: 'refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: mockUser,
};

// --- Helpers ---

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: mockSession } });
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mockUnsubscribe } } });
  mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
  mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
  mockSignOut.mockResolvedValue({ error: null });
});

// --- Tests ---

describe('AuthContext', () => {
  describe('session initialization', () => {
    it('starts in loading state', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.loading).toBe(true);
    });

    it('populates user after getSession resolves', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.session).toEqual(mockSession);
    });

    it('sets user to null when there is no session', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();
    });

    it('subscribes to onAuthStateChange on mount', async () => {
      renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
      });
    });

    it('unsubscribes from onAuthStateChange on unmount', async () => {
      const { unmount } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(mockOnAuthStateChange).toHaveBeenCalled();
      });

      unmount();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('signInWithEmail', () => {
    it('calls signInWithOtp with the provided email', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signInWithEmail('a@b.com');
      });

      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'a@b.com' })
      );
    });

    it('includes emailRedirectTo in signInWithOtp options', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signInWithEmail('a@b.com');
      });

      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ emailRedirectTo: expect.any(String) }),
        })
      );
    });
  });

  describe('signInWithGoogle', () => {
    it('calls signInWithOAuth with google provider', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signInWithGoogle();
      });

      expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' })
      );
    });
  });

  describe('signOut', () => {
    it('calls supabase.auth.signOut', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('useAuth hook', () => {
    it('throws when used outside of AuthProvider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => renderHook(() => useAuth())).toThrow(
        'useAuth must be used within an AuthProvider'
      );
      spy.mockRestore();
    });
  });

  describe('rendering gate', () => {
    it('renders children after loading resolves', async () => {
      render(
        <AuthProvider>
          <div data-testid="child">hello</div>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('child')).toBeInTheDocument();
      });
    });
  });
});
