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
