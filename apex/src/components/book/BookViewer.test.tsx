import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { BookViewer } from './BookViewer';
import { createMockStory } from '../../test/fixtures';
import type { IStoryManifest } from '../../types/story.types';

// --- Mocks ---

// Mock react-pageflip: render children as divs, expose flipNext/flipPrev via ref
const mockFlipNext = vi.fn();
const mockFlipPrev = vi.fn();

vi.mock('react-pageflip', () => {
  const React = require('react');
  const HTMLFlipBook = React.forwardRef(
    (props: { children: React.ReactNode; className?: string }, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        pageFlip: () => ({
          flipNext: mockFlipNext,
          flipPrev: mockFlipPrev,
        }),
      }));
      return <div data-testid="flip-book" className={props.className}>{props.children}</div>;
    },
  );
  HTMLFlipBook.displayName = 'HTMLFlipBook';
  return { default: HTMLFlipBook };
});

vi.mock('../../services/StorageService', () => ({
  StorageService: {
    getStory: vi.fn(),
    updateStory: vi.fn(),
    getAllStories: vi.fn(),
    saveStory: vi.fn(),
    deleteStory: vi.fn(),
  },
}));

// Mock the CSS import
vi.mock('./BookViewer.css', () => ({}));

import { StorageService } from '../../services/StorageService';

const mockGetStory = StorageService.getStory as ReturnType<typeof vi.fn>;
const mockUpdateStory = StorageService.updateStory as ReturnType<typeof vi.fn>;

// --- Helpers ---

function renderBookViewer(storyId = 'story-1', onClose = vi.fn()) {
  return render(<BookViewer storyId={storyId} onClose={onClose} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockGetStory.mockReset();
  mockUpdateStory.mockReset();
  mockFlipNext.mockReset();
  mockFlipPrev.mockReset();
});

// --- Tests ---

describe('BookViewer', () => {
  // ---- Loading ----

  describe('loading', () => {
    it('shows loading state before story loads', () => {
      mockGetStory.mockReturnValue(new Promise(() => {})); // never resolves
      renderBookViewer();

      expect(screen.getByText(/loading book/i)).toBeInTheDocument();
    });

    it('renders story content after load', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText(story.metadata.title)).toBeInTheDocument();
      });
    });

    it('marks story as read when hasBeenRead is false', async () => {
      const story = createMockStory({
        metadata: { id: 'story-1', title: 'Test', createdAt: Date.now(), hasBeenRead: false },
      });
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        expect(mockUpdateStory).toHaveBeenCalledWith('story-1', {
          metadata: expect.objectContaining({ hasBeenRead: true }),
        });
      });
    });

    it('does NOT mark as read when already read', async () => {
      const story = createMockStory({
        metadata: { id: 'story-1', title: 'Test', createdAt: Date.now(), hasBeenRead: true },
      });
      mockGetStory.mockResolvedValue(story);
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText(story.metadata.title)).toBeInTheDocument();
      });

      expect(mockUpdateStory).not.toHaveBeenCalled();
    });
  });

  // ---- Cover ----

  describe('front cover', () => {
    it('shows title and animal names', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('Who Would Win?')).toBeInTheDocument();
      });

      // Animal names in the cover combatants section
      const combatants = screen.getByText('Who Would Win?').closest('.page-cover');
      expect(combatants).toHaveTextContent('Lion');
      expect(combatants).toHaveTextContent('Tiger');
    });

    it('renders cover image when coverImageUrl is available', async () => {
      const story = createMockStory({ coverImageUrl: 'http://example.com/cover.png' });
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        const img = screen.getByAltText('Cover');
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', 'http://example.com/cover.png');
      });
    });

    it('does not render img when coverImageUrl is falsy', async () => {
      const story = createMockStory({ coverImageUrl: undefined });
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('Who Would Win?')).toBeInTheDocument();
      });

      expect(screen.queryByAltText('Cover')).not.toBeInTheDocument();
    });
  });

  // ---- Pages ----

  describe('pages', () => {
    it('renders all story pages', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('The lion is a large cat.')).toBeInTheDocument();
        expect(screen.getByText('The tiger is the largest cat species.')).toBeInTheDocument();
      });
    });

    it('shows title on left pages', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('Scientific Classification')).toBeInTheDocument();
      });
    });

    it('renders generated image when imageUrl exists', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        const img = screen.getByAltText('Generated Illustration');
        expect(img).toHaveAttribute('src', 'http://example.com/page1.png');
      });
    });

    it('shows placeholder when imageUrl is missing', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        // Page 2 has no imageUrl, so visual prompt is shown
        expect(screen.getByText('A powerful tiger')).toBeInTheDocument();
      });
    });

    it('renders fun fact box when funFact exists', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('Lions can sleep 20 hours a day!')).toBeInTheDocument();
        expect(screen.getByText('Fun Fact')).toBeInTheDocument();
      });
    });

    it('does not render fun fact box when funFact is falsy', async () => {
      const story = createMockStory({
        pages: [
          {
            index: 1,
            title: 'Page Title',
            bodyText: 'Some text',
            visualPrompt: 'Prompt',
            isLeftPage: true,
            // no funFact
          },
        ],
      });
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('Some text')).toBeInTheDocument();
      });

      expect(screen.queryByText('Fun Fact')).not.toBeInTheDocument();
    });
  });

  // ---- Checklist ----

  describe('checklist', () => {
    it('renders checklist page with trait rows', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('Predictions Checklist')).toBeInTheDocument();
      });

      expect(screen.getByText('Speed')).toBeInTheDocument();
      expect(screen.getByText('Strength')).toBeInTheDocument();
    });

    it('shows animal names in checklist header', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        const header = screen.getByText('Trait').closest('.checklist-header');
        expect(header).toHaveTextContent('Lion');
        expect(header).toHaveTextContent('Tiger');
      });
    });
  });

  // ---- Navigation ----

  describe('navigation', () => {
    it('calls flipPrev on left arrow key', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText(story.metadata.title)).toBeInTheDocument();
      });

      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      expect(mockFlipPrev).toHaveBeenCalled();
    });

    it('calls flipNext on right arrow key', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText(story.metadata.title)).toBeInTheDocument();
      });

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(mockFlipNext).toHaveBeenCalled();
    });

    it('calls onClose when close button is clicked', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      const onClose = vi.fn();
      renderBookViewer('story-1', onClose);

      await waitFor(() => {
        expect(screen.getByText(story.metadata.title)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/back to library/i));

      expect(onClose).toHaveBeenCalled();
    });

    it('cleans up keydown event listener on unmount', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);

      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText(story.metadata.title)).toBeInTheDocument();
      });

      unmount();

      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });
  });

  // ---- Back Cover ----

  describe('back cover', () => {
    it('renders "The End" text', async () => {
      const story = createMockStory();
      mockGetStory.mockResolvedValue(story);
      mockUpdateStory.mockResolvedValue(undefined);
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('The End')).toBeInTheDocument();
      });
    });
  });
});
