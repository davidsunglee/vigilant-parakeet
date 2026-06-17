import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PressRoom } from './PressRoom';
import { createMockStoryRecord } from '../../test/fixtures';
import type { StoryRecord } from '../../types/story.types';

function noop() {}

function setup(
  over: Partial<StoryRecord> = {},
  handlers: Partial<{
    onReadStory: (id: string) => void;
    onRetry: (id: string) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
    coverUrl: string;
  }> = {},
) {
  const story = createMockStoryRecord({
    status: 'generating',
    title: null,
    manifest: null,
    cover_image_path: null,
    progress: { phase: 'queued' },
    ...over,
  });
  return render(
    <PressRoom
      story={story}
      coverUrl={handlers.coverUrl}
      onReadStory={handlers.onReadStory ?? noop}
      onRetry={handlers.onRetry ?? noop}
      onDelete={handlers.onDelete ?? noop}
      onClose={handlers.onClose ?? noop}
    />,
  );
}

describe('PressRoom', () => {
  it('narrates the warmup without plates', () => {
    setup({ progress: { phase: 'researching' } });
    expect(screen.getByText('Studying the contenders')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
    expect(document.querySelectorAll('.pr-plate')).toHaveLength(0);
  });

  it('renders the press bed with one plate per page while illustrating', () => {
    setup({ progress: { phase: 'illustrating', page: 7, total: 14 } });
    expect(screen.getByText('Printing the pages')).toBeInTheDocument();
    expect(screen.getByText('Plate 7 of 14')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
    expect(document.querySelectorAll('.pr-plate')).toHaveLength(14);
    expect(document.querySelectorAll('.pr-plate.is-done')).toHaveLength(7);
  });

  it('reveals the cover and reads on ready', async () => {
    const onReadStory = vi.fn();
    const onClose = vi.fn();
    setup({ status: 'ready' }, { onReadStory, onClose, coverUrl: 'https://signed/cover.png' });
    expect(screen.getByText(/hot off the press/i)).toBeInTheDocument();
    expect(screen.getByAltText('Lion vs Tiger')).toHaveAttribute('src', 'https://signed/cover.png');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /read the book/i }));
    expect(onReadStory).toHaveBeenCalledWith('story-1');
    await user.click(screen.getByRole('button', { name: /back to the shelf/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the jammed state with Try again and Remove', async () => {
    const onRetry = vi.fn();
    const onDelete = vi.fn();
    setup({ status: 'failed', error: 'Image service timed out.' }, { onRetry, onDelete });
    expect(screen.getByText(/press jammed/i)).toBeInTheDocument();
    expect(screen.getByText(/image service timed out/i)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledWith('story-1');
    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(onDelete).toHaveBeenCalledWith('story-1');
  });

  it('closes on Escape and on the back control', async () => {
    const onClose = vi.fn();
    setup({ progress: { phase: 'queued' } }, { onClose });
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /reading room/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
