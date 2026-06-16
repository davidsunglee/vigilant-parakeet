import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookViewer } from './BookViewer';
import { createMockStory, createMockStoryRecord } from '../../test/fixtures';

vi.mock('../../services/CatalogService', () => ({
  CatalogService: { getStory: vi.fn(), resolveSignedUrls: vi.fn() },
}));
vi.mock('./BookViewer.css', () => ({}));

import { CatalogService } from '../../services/CatalogService';
const mockGetStory = CatalogService.getStory as ReturnType<typeof vi.fn>;
const mockResolveSignedUrls = CatalogService.resolveSignedUrls as ReturnType<typeof vi.fn>;

// jsdom has no matchMedia; stub it (wide viewport => spread mode).
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
});

const manifest = createMockStory({
  coverImageUrl: 'stories/story-1/cover.png',
  pages: [
    { index: 1, title: 'Meet the Animal', bodyText: 'The lion is a large cat.', visualPrompt: 'A lion', imageUrl: 'stories/story-1/1.png', funFact: 'Lions sleep a lot!', isLeftPage: true },
    { index: 2, title: '', bodyText: 'The tiger is the largest cat.', visualPrompt: 'A tiger', imageUrl: 'stories/story-1/2.png', isLeftPage: false },
    { index: 31, title: 'The Showdown', bodyText: 'They face off!', visualPrompt: 'Both', imageUrl: 'stories/story-1/31.png', isLeftPage: true },
    { index: 32, title: 'Outcome', bodyText: 'The lion wins!', visualPrompt: 'Lion victorious', imageUrl: 'stories/story-1/32.png', isLeftPage: false },
  ],
});

const signedUrls: Record<string, string> = {
  'stories/story-1/cover.png': 'https://signed/cover.png',
  'stories/story-1/1.png': 'https://signed/1.png',
  'stories/story-1/2.png': 'https://signed/2.png',
  'stories/story-1/31.png': 'https://signed/31.png',
  'stories/story-1/32.png': 'https://signed/32.png',
};

beforeEach(() => {
  mockGetStory.mockReset();
  mockResolveSignedUrls.mockReset();
  mockGetStory.mockResolvedValue(createMockStoryRecord({ manifest }));
  mockResolveSignedUrls.mockResolvedValue(signedUrls);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderViewer(onClose = vi.fn()) {
  return render(<BookViewer storyId="story-1" onClose={onClose} />);
}

describe('BookViewer', () => {
  it('shows the loading state before the manifest resolves', () => {
    mockGetStory.mockReturnValue(new Promise(() => {}));
    renderViewer();
    expect(screen.getByText(/opening the book/i)).toBeInTheDocument();
  });

  it('opens on the cover and resolves signed URLs for the cover and pages', async () => {
    renderViewer();
    await waitFor(() => expect(screen.getByText('Who Would Win?')).toBeInTheDocument());

    expect(screen.getByText('Lion')).toBeInTheDocument();
    expect(screen.getByText('Tiger')).toBeInTheDocument();
    expect(mockResolveSignedUrls).toHaveBeenCalledWith([
      'stories/story-1/cover.png',
      'stories/story-1/1.png',
      'stories/story-1/2.png',
      'stories/story-1/31.png',
      'stories/story-1/32.png',
    ]);
  });

  it('advances to the first chapter spread with the right arrow key', async () => {
    renderViewer();
    await waitFor(() => expect(screen.getByText('Who Would Win?')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    await waitFor(() => expect(screen.getByText('The lion is a large cat.')).toBeInTheDocument());
    expect(screen.getByText('The tiger is the largest cat.')).toBeInTheDocument();
    // The chapter title shows in both the page header and the bottom progress label.
    expect(screen.getAllByText('Meet the Animal').length).toBeGreaterThanOrEqual(1);
  });

  it('exits via the Library control and via Escape, and cleans up the key listener', async () => {
    const onClose = vi.fn();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderViewer(onClose);
    await waitFor(() => expect(screen.getByText('Who Would Win?')).toBeInTheDocument());

    await userEvent.setup().click(screen.getByRole('button', { name: /library/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
