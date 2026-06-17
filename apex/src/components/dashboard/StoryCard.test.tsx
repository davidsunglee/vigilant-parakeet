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

  it('renders a generating card with the beat, derived progress, count, and no Read', () => {
    const generating = createMockStoryRecord({
      id: 'gen-1',
      status: 'generating',
      title: null,
      manifest: null,
      cover_image_path: null,
      progress: { phase: 'illustrating', page: 7, total: 14 },
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

    expect(screen.getByText('Printing the pages')).toBeInTheDocument();
    expect(screen.getByText('7 of 14')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
    expect(screen.queryByRole('button', { name: /read the book/i })).not.toBeInTheDocument();
  });

  it('opens the Press Room from the generating cover when onWatch is given', async () => {
    const onWatch = vi.fn();
    const generating = createMockStoryRecord({
      id: 'gen-2',
      status: 'generating',
      title: null,
      manifest: null,
      cover_image_path: null,
      progress: { phase: 'researching' },
      animal_a: 'Lion',
      animal_b: 'Wolverine',
    });
    render(
      <StoryCard
        story={generating}
        isWinnerRevealed={false}
        onToggleWinner={noop}
        onReadStory={noop}
        onDelete={noop}
        onWatch={onWatch}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /watch lion & wolverine being printed/i }));
    expect(onWatch).toHaveBeenCalledWith('gen-2');
  });

  it('renders a failed card with its error, Remove, and Try again when onRetry is given', async () => {
    const onRetry = vi.fn();
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
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText(/did not come together/i)).toBeInTheDocument();
    expect(screen.getByText(/api quota exceeded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove story/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /read the book/i })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledWith('fail-1');
  });
});
