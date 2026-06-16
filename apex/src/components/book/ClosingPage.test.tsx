import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClosingPage } from './ClosingPage';
import { createMockStory } from '../../test/fixtures';

describe('ClosingPage', () => {
  it('renders the colophon and wires both actions', async () => {
    const manifest = createMockStory({
      metadata: { id: 's', title: 't', createdAt: new Date('2026-06-14T12:00:00Z').getTime(), hasBeenRead: false },
    });
    const onReadAgain = vi.fn();
    const onClose = vi.fn();
    render(<ClosingPage manifest={manifest} onReadAgain={onReadAgain} onClose={onClose} />);

    expect(screen.getByText('The End')).toBeInTheDocument();
    expect(screen.getByText('An Apex Publication')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /read it again/i }));
    expect(onReadAgain).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /back to the reading room/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
