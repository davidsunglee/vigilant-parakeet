import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from './Dashboard';
import { createMockStoryRecord } from '../../test/fixtures';
import type { StoryChangeHandler } from '../../services/CatalogService';

// --- Mocks ---

// The Realtime subscription handler captured from subscribeToStories so tests
// can dispatch fake postgres_changes payloads.
let realtimeHandler: StoryChangeHandler | null = null;

vi.mock('../../services/CatalogService', () => ({
  CatalogService: {
    listStories: vi.fn(),
    subscribeToStories: vi.fn(),
    createStory: vi.fn(),
    resolveSignedUrls: vi.fn(),
    deleteStory: vi.fn(),
  },
}));

// Dashboard reads the signed-in user via useAuth; supply a stable user.
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'owner-1' },
    session: null,
    loading: false,
    signInWithEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  }),
}));

// Dashboard uses supabase.removeChannel on unmount; mock the browser client so
// the real createClient never runs in tests.
vi.mock('../../lib/supabase', () => ({
  supabase: { removeChannel: vi.fn() },
}));

import { CatalogService } from '../../services/CatalogService';

const mockListStories = CatalogService.listStories as ReturnType<typeof vi.fn>;
const mockSubscribe = CatalogService.subscribeToStories as ReturnType<typeof vi.fn>;
const mockCreateStory = CatalogService.createStory as ReturnType<typeof vi.fn>;
const mockResolveSignedUrls = CatalogService.resolveSignedUrls as ReturnType<typeof vi.fn>;
const mockDeleteStory = CatalogService.deleteStory as ReturnType<typeof vi.fn>;

beforeEach(() => {
  realtimeHandler = null;
  mockListStories.mockReset();
  mockSubscribe.mockReset();
  mockCreateStory.mockReset();
  mockResolveSignedUrls.mockReset();
  mockDeleteStory.mockReset();

  mockListStories.mockResolvedValue([]);
  mockResolveSignedUrls.mockResolvedValue({});
  mockSubscribe.mockImplementation((_userId: string, handler: StoryChangeHandler) => {
    realtimeHandler = handler;
    return { unsubscribe: vi.fn() };
  });
});

function renderDashboard(onReadStory = vi.fn()) {
  return render(<Dashboard onReadStory={onReadStory} />);
}

/** Dispatch a fake Realtime payload through the captured handler. */
function dispatchRealtime(payload: unknown) {
  act(() => {
    realtimeHandler?.(payload as Parameters<StoryChangeHandler>[0]);
  });
}

describe('Dashboard', () => {
  describe('rendering', () => {
    it('shows "Your library is empty" when there are no stories', async () => {
      mockListStories.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });
    });

    it('subscribes to owner-filtered Realtime changes on mount', async () => {
      renderDashboard();
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalledWith('owner-1', expect.any(Function));
      });
    });
  });

  describe('status-aware cards', () => {
    it('renders a generating row with a progress bar and the progress step', async () => {
      const generating = createMockStoryRecord({
        id: 'gen-1',
        status: 'generating',
        title: null,
        manifest: null,
        cover_image_path: null,
        progress_step: 'Illustrating the pages…',
        progress_pct: 42,
        animal_a: 'Wolf',
        animal_b: 'Bear',
      });
      mockListStories.mockResolvedValue([generating]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Illustrating the pages…')).toBeInTheDocument();
      });

      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuenow', '42');
      expect(
        screen.queryByRole('button', { name: /read full book/i }),
      ).not.toBeInTheDocument();
    });

    it('renders a ready row with the signed cover URL, a Read button, and reveal-winner', async () => {
      const ready = createMockStoryRecord(); // status 'ready', cover path, manifest
      mockListStories.mockResolvedValue([ready]);
      mockResolveSignedUrls.mockResolvedValue({
        'stories/story-1/cover.png': 'https://signed/cover.png',
      });
      const onReadStory = vi.fn();
      renderDashboard(onReadStory);

      await waitFor(() => {
        const img = screen.getByAltText('Lion vs Tiger');
        expect(img).toHaveAttribute('src', 'https://signed/cover.png');
      });

      const readBtn = screen.getByRole('button', { name: /read full book/i });
      const user = userEvent.setup();
      await user.click(readBtn);
      expect(onReadStory).toHaveBeenCalledWith('story-1');

      // Reveal winner reads from manifest.outcome (winnerId 'animalA' => Lion)
      await user.click(screen.getByRole('button', { name: /reveal winner/i }));
      expect(screen.getByText(/winner: lion/i)).toBeInTheDocument();
    });

    it('renders a failed row with its error and offers no Read button', async () => {
      const failed = createMockStoryRecord({
        id: 'fail-1',
        status: 'failed',
        title: null,
        manifest: null,
        cover_image_path: null,
        error: 'API quota exceeded',
      });
      mockListStories.mockResolvedValue([failed]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/api quota exceeded/i)).toBeInTheDocument();
      });

      expect(
        screen.queryByRole('button', { name: /read full book/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });
  });

  describe('realtime transitions', () => {
    it('moves a row from generating to ready on a Realtime UPDATE', async () => {
      const generating = createMockStoryRecord({
        id: 'story-1',
        status: 'generating',
        title: null,
        manifest: null,
        cover_image_path: null,
        progress_step: 'Writing the narrative…',
        progress_pct: 60,
      });
      mockListStories.mockResolvedValue([generating]);
      mockResolveSignedUrls.mockResolvedValue({
        'stories/story-1/cover.png': 'https://signed/cover.png',
      });
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
      });

      const ready = createMockStoryRecord({ id: 'story-1', status: 'ready' });
      dispatchRealtime({ eventType: 'UPDATE', new: ready, old: generating });

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /read full book/i }),
        ).toBeInTheDocument();
      });
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('prepends a new row on a Realtime INSERT (deduped by id)', async () => {
      mockListStories.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      const inserted = createMockStoryRecord({
        id: 'new-1',
        status: 'generating',
        title: null,
        manifest: null,
        cover_image_path: null,
        progress_step: 'Queued…',
        progress_pct: 0,
        animal_a: 'Eagle',
        animal_b: 'Hawk',
      });
      dispatchRealtime({ eventType: 'INSERT', new: inserted, old: {} });

      await waitFor(() => {
        expect(screen.getByText('Eagle')).toBeInTheDocument();
      });
      // Dispatching the same id again does not duplicate the card.
      dispatchRealtime({ eventType: 'INSERT', new: inserted, old: {} });
      expect(screen.getAllByText('Eagle')).toHaveLength(1);
    });
  });

  describe('form submission', () => {
    it('calls createStory with the form values and clears the form (non-blocking)', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([]);
      mockCreateStory.mockResolvedValue('story-xyz');
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByLabelText(/art style/i), 'watercolor');
      await user.click(screen.getByLabelText(/fierce mode/i));
      const inputA = screen.getByPlaceholderText(/animal a/i) as HTMLInputElement;
      const inputB = screen.getByPlaceholderText(/animal b/i) as HTMLInputElement;
      await user.type(inputA, 'Lion');
      await user.type(inputB, 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(mockCreateStory).toHaveBeenCalledWith({
          animalA: 'Lion',
          animalB: 'Tiger',
          artStyle: 'watercolor',
          fierceMode: true,
        });
      });

      // Form clears and visual controls reset after submit.
      await waitFor(() => {
        expect(inputA).toHaveValue('');
        expect(inputB).toHaveValue('');
      });
      expect(screen.getByLabelText(/art style/i)).toHaveValue('surprise');
      expect(screen.getByLabelText(/fierce mode/i)).not.toBeChecked();
    });

    it('does not render a full-screen blocking generation overlay', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([]);
      // createStory never resolves; the UI must stay interactive regardless.
      mockCreateStory.mockReturnValue(new Promise(() => {}));
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText(/animal a/i), 'Lion');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      expect(screen.queryByText(/creating your book/i)).not.toBeInTheDocument();
      // Library remains interactive: the art-style picker is still enabled.
      expect(screen.getByLabelText(/art style/i)).toBeEnabled();
    });
  });

  describe('delete', () => {
    it('optimistically removes a story from the UI', async () => {
      const user = userEvent.setup();
      const ready = createMockStoryRecord();
      mockListStories.mockResolvedValue([ready]);
      mockResolveSignedUrls.mockResolvedValue({
        'stories/story-1/cover.png': 'https://signed/cover.png',
      });
      mockDeleteStory.mockReturnValue(new Promise(() => {}));
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Lion')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete story/i }));

      await waitFor(() => {
        expect(screen.queryByText('Lion')).not.toBeInTheDocument();
      });
      expect(mockDeleteStory).toHaveBeenCalledWith('story-1');
    });
  });

  describe('art style picker', () => {
    it('renders the six art style options in order', async () => {
      mockListStories.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/art style/i) as HTMLSelectElement;
      const labels = Array.from(select.options).map((o) => o.textContent);
      expect(labels).toEqual([
        'Surprise Me',
        'Watercolor',
        'Colored Pencil Sketch',
        'Storybook Painterly',
        'Graphic Novel',
        '3D Animated',
      ]);
    });

    it('renders the Fierce Mode toggle, default off', async () => {
      mockListStories.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      const toggle = screen.getByLabelText(/fierce mode/i) as HTMLInputElement;
      expect(toggle.type).toBe('checkbox');
      expect(toggle.checked).toBe(false);
    });
  });

  describe('provider/model picker removal', () => {
    it('does not render any LLM/image provider or model selector', async () => {
      mockListStories.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/llm provider/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/image provider/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/image model/i)).not.toBeInTheDocument();
    });
  });
});
