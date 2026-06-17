import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchupComposer } from './MatchupComposer';

describe('MatchupComposer', () => {
  it('renders the five art-style chips in order with Painterly renamed, default Watercolor', () => {
    render(<MatchupComposer variant="inline" onCreate={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.textContent?.trim())).toEqual([
      'Watercolor',
      'Colored Pencil Sketch',
      'Painterly',
      'Graphic Novel',
      '3D Animated',
    ]);
    expect(screen.getByRole('radio', { name: /watercolor/i })).toBeChecked();
  });

  it('submits the trimmed values and resets the form (inline)', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MatchupComposer variant="inline" onCreate={onCreate} />);

    const a = screen.getByLabelText(/first contender/i) as HTMLInputElement;
    const b = screen.getByLabelText(/second contender/i) as HTMLInputElement;
    await user.type(a, 'Lion');
    await user.type(b, 'Tiger');
    await user.click(screen.getByRole('radio', { name: /graphic novel/i }));
    await user.click(screen.getByLabelText(/fierce mode/i));
    await user.click(screen.getByRole('button', { name: /conjure the book/i }));

    expect(onCreate).toHaveBeenCalledWith({
      animalA: 'Lion',
      animalB: 'Tiger',
      artStyle: 'graphic-novel',
      fierceMode: true,
    });

    await waitFor(() => {
      expect(a).toHaveValue('');
      expect(b).toHaveValue('');
    });
    expect(screen.getByRole('radio', { name: /watercolor/i })).toBeChecked();
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

  it('overlay focuses the first contender on open', () => {
    render(<MatchupComposer variant="overlay" onCreate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/first contender/i)).toHaveFocus();
  });
});
