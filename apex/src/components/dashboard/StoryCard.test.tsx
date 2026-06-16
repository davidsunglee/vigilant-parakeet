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
