import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignIn } from './SignIn';

// SignIn reads the two auth methods from useAuth; supply controllable mocks so
// each test can resolve or reject the magic-link call.
const { mockSignInWithEmail, mockSignInWithGoogle } = vi.hoisted(() => ({
  mockSignInWithEmail: vi.fn(),
  mockSignInWithGoogle: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    loading: false,
    signInWithEmail: mockSignInWithEmail,
    signInWithGoogle: mockSignInWithGoogle,
    signOut: vi.fn(),
  }),
}));

beforeEach(() => {
  mockSignInWithEmail.mockReset();
  mockSignInWithGoogle.mockReset();
  mockSignInWithEmail.mockResolvedValue(undefined);
  mockSignInWithGoogle.mockResolvedValue(undefined);
});

describe('SignIn', () => {
  it('renders the title, kicker, email field, and both sign-in buttons', () => {
    render(<SignIn />);

    expect(screen.getByRole('heading', { name: /who would win/i })).toBeInTheDocument();
    expect(screen.getByText(/an apex publication/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send me a magic link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('submits the magic link and shows the confirmation with the address', async () => {
    const user = userEvent.setup();
    render(<SignIn />);

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: /send me a magic link/i }));

    expect(mockSignInWithEmail).toHaveBeenCalledWith('reader@example.com');
    await waitFor(() => {
      expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
    });
    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
  });

  it('returns to the form when "use a different email" is clicked', async () => {
    const user = userEvent.setup();
    render(<SignIn />);

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: /send me a magic link/i }));
    await screen.findByText(/check your inbox/i);

    await user.click(screen.getByRole('button', { name: /use a different email/i }));

    const field = screen.getByRole('textbox', { name: /email/i }) as HTMLInputElement;
    expect(field).toBeInTheDocument();
    expect(field).toHaveValue('');
  });

  it('calls signInWithGoogle when the Google button is clicked', async () => {
    const user = userEvent.setup();
    render(<SignIn />);

    await user.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('shows an inline error and keeps the form usable when sending fails', async () => {
    const user = userEvent.setup();
    mockSignInWithEmail.mockRejectedValue(new Error('network down'));
    render(<SignIn />);

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: /send me a magic link/i }));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
    // Form is still present and the submit button is enabled for a retry.
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send me a magic link/i })).toBeEnabled();
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
  });

  it('rejects an invalid email without calling the API', async () => {
    const user = userEvent.setup();
    render(<SignIn />);

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /send me a magic link/i }));

    expect(screen.getByText(/does not look right/i)).toBeInTheDocument();
    expect(mockSignInWithEmail).not.toHaveBeenCalled();
  });
});
