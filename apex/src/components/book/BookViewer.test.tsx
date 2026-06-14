import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BookViewer } from './BookViewer';
import { createMockStory, createMockStoryRecord } from '../../test/fixtures';

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

vi.mock('../../services/CatalogService', () => ({
  CatalogService: {
    getStory: vi.fn(),
    resolveSignedUrls: vi.fn(),
  },
}));

// Mock the CSS import
vi.mock('./BookViewer.css', () => ({}));

import { CatalogService } from '../../services/CatalogService';

const mockGetStory = CatalogService.getStory as ReturnType<typeof vi.fn>;
const mockResolveSignedUrls = CatalogService.resolveSignedUrls as ReturnType<typeof vi.fn>;

// Default story record using Storage paths in the manifest
const defaultManifest = createMockStory({
  coverImageUrl: 'stories/story-1/cover.png',
  pages: [
    {
      index: 1,
      title: 'Scientific Classification',
      bodyText: 'The lion is a large cat.',
      visualPrompt: 'A majestic lion',
      imageUrl: 'stories/story-1/1.png',
      funFact: 'Lions can sleep 20 hours a day!',
      isLeftPage: true,
    },
    {
      index: 2,
      title: '',
      bodyText: 'The tiger is the largest cat species.',
      visualPrompt: 'A powerful tiger',
      isLeftPage: false,
    },
  ],
});

const defaultStoryRecord = createMockStoryRecord({ manifest: defaultManifest });

const defaultSignedUrls: Record<string, string> = {
  'stories/story-1/cover.png': 'https://signed/cover.png',
  'stories/story-1/1.png': 'https://signed/1.png',
};

// --- Helpers ---

function renderBookViewer(storyId = 'story-1', onClose = vi.fn()) {
  return render(<BookViewer storyId={storyId} onClose={onClose} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockGetStory.mockReset();
  mockResolveSignedUrls.mockReset();
  mockFlipNext.mockReset();
  mockFlipPrev.mockReset();

  // Default: happy path with signed URLs
  mockGetStory.mockResolvedValue(defaultStoryRecord);
  mockResolveSignedUrls.mockResolvedValue(defaultSignedUrls);
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
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText(defaultManifest.metadata.title)).toBeInTheDocument();
      });
    });
  });

  // ---- Cover ----

  describe('front cover', () => {
    it('shows title and animal names', async () => {
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('Who Would Win?')).toBeInTheDocument();
      });

      const combatants = screen.getByText('Who Would Win?').closest('.page-cover');
      expect(combatants).toHaveTextContent('Lion');
      expect(combatants).toHaveTextContent('Tiger');
    });

    it('renders cover image from signed URL with lazy loading attributes', async () => {
      renderBookViewer();

      await waitFor(() => {
        const img = screen.getByAltText('Cover');
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', 'https://signed/cover.png');
        expect(img).toHaveAttribute('loading', 'lazy');
        expect(img).toHaveAttribute('decoding', 'async');
      });
    });

    it('does not render cover img when coverImageUrl is absent from manifest', async () => {
      const manifest = createMockStory({ coverImageUrl: undefined });
      mockGetStory.mockResolvedValue(createMockStoryRecord({ manifest }));
      mockResolveSignedUrls.mockResolvedValue({});
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
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('The lion is a large cat.')).toBeInTheDocument();
        expect(screen.getByText('The tiger is the largest cat species.')).toBeInTheDocument();
      });
    });

    it('shows title on left pages', async () => {
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('Scientific Classification')).toBeInTheDocument();
      });
    });

    it('renders generated image from signed URL with lazy loading attributes', async () => {
      renderBookViewer();

      await waitFor(() => {
        const img = screen.getByAltText('Generated Illustration');
        expect(img).toHaveAttribute('src', 'https://signed/1.png');
        expect(img).toHaveAttribute('loading', 'lazy');
        expect(img).toHaveAttribute('decoding', 'async');
      });
    });

    it('shows placeholder when imageUrl is missing', async () => {
      renderBookViewer();

      await waitFor(() => {
        // Page 2 has no imageUrl, so visual prompt is shown
        expect(screen.getByText('A powerful tiger')).toBeInTheDocument();
      });
    });

    it('renders fun fact box when funFact exists', async () => {
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('Lions can sleep 20 hours a day!')).toBeInTheDocument();
        expect(screen.getByText('Fun Fact')).toBeInTheDocument();
      });
    });

    it('does not render fun fact box when funFact is falsy', async () => {
      const manifest = createMockStory({
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
      mockGetStory.mockResolvedValue(createMockStoryRecord({ manifest }));
      mockResolveSignedUrls.mockResolvedValue({});
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
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('Predictions Checklist')).toBeInTheDocument();
      });

      expect(screen.getByText('Speed')).toBeInTheDocument();
      expect(screen.getByText('Strength')).toBeInTheDocument();
    });

    it('shows animal names in checklist header', async () => {
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
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText(defaultManifest.metadata.title)).toBeInTheDocument();
      });

      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      expect(mockFlipPrev).toHaveBeenCalled();
    });

    it('calls flipNext on right arrow key', async () => {
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText(defaultManifest.metadata.title)).toBeInTheDocument();
      });

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(mockFlipNext).toHaveBeenCalled();
    });

    it('calls onClose when close button is clicked', async () => {
      const onClose = vi.fn();
      renderBookViewer('story-1', onClose);

      await waitFor(() => {
        expect(screen.getByText(defaultManifest.metadata.title)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/back to library/i));

      expect(onClose).toHaveBeenCalled();
    });

    it('cleans up keydown event listener on unmount', async () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText(defaultManifest.metadata.title)).toBeInTheDocument();
      });

      unmount();

      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });
  });

  // ---- Back Cover ----

  describe('back cover', () => {
    it('renders "The End" text', async () => {
      renderBookViewer();

      await waitFor(() => {
        expect(screen.getByText('The End')).toBeInTheDocument();
      });
    });
  });
});
