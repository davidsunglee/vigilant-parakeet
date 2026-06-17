import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from './Dashboard';
import { createMockStoryRecord } from '../../test/fixtures';
import type { StoryChangeHandler } from '../../services/CatalogService';

// The Realtime handler captured from subscribeToStories so tests can dispatch
// fake postgres_changes payloads.
let realtimeHandler: StoryChangeHandler | null = null;

vi.mock('../../services/CatalogService', () => ({
  CatalogService: {
    listStories: vi.fn(),
    subscribeToStories: vi.fn(),
    createStory: vi.fn(),
    resolveSignedUrls: vi.fn(),
    deleteStory: vi.fn(),
    retryStory: vi.fn(),
  },
}));

const mockSignOut = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'owner-1', email: 'reader@example.com' },
    session: null,
    loading: false,
    signInWithEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: mockSignOut,
  }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: { removeChannel: vi.fn() },
}));

import { CatalogService } from '../../services/CatalogService';

const mockListStories = CatalogService.listStories as ReturnType<typeof vi.fn>;
const mockSubscribe = CatalogService.subscribeToStories as ReturnType<typeof vi.fn>;
const mockCreateStory = CatalogService.createStory as ReturnType<typeof vi.fn>;
const mockResolveSignedUrls = CatalogService.resolveSignedUrls as ReturnType<typeof vi.fn>;
const mockDeleteStory = CatalogService.deleteStory as ReturnType<typeof vi.fn>;
const mockRetryStory = CatalogService.retryStory as ReturnType<typeof vi.fn>;

beforeEach(() => {
  realtimeHandler = null;
  mockListStories.mockReset();
  mockSubscribe.mockReset();
  mockCreateStory.mockReset();
  mockResolveSignedUrls.mockReset();
  mockDeleteStory.mockReset();
  mockRetryStory.mockReset();
  mockRetryStory.mockResolvedValue('story-1');
  mockSignOut.mockReset();

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

function dispatchRealtime(payload: unknown) {
  act(() => {
    realtimeHandler?.(payload as Parameters<StoryChangeHandler>[0]);
  });
}

describe('Dashboard', () => {
  describe('empty state', () => {
    it('shows the inline composer when there are no stories', async () => {
      mockListStories.mockResolvedValue([]);
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByText(/conjure your first matchup/i)).toBeInTheDocument();
      });
      expect(screen.getByLabelText(/first contender/i)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /begin a new matchup/i }),
      ).not.toBeInTheDocument();
    });

    it('subscribes to owner-filtered Realtime changes on mount', async () => {
      renderDashboard();
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalledWith('owner-1', expect.any(Function));
      });
    });
  });

  describe('compose', () => {
    it('calls createStory with the form values and resets the form (non-blocking)', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([]);
      mockCreateStory.mockResolvedValue('story-xyz');
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByLabelText(/first contender/i)).toBeInTheDocument();
      });

      const a = screen.getByLabelText(/first contender/i) as HTMLInputElement;
      const b = screen.getByLabelText(/second contender/i) as HTMLInputElement;
      await user.type(a, 'Lion');
      await user.type(b, 'Tiger');
      await user.click(screen.getByRole('radio', { name: /watercolor/i }));
      await user.click(screen.getByLabelText(/fierce mode/i));
      await user.click(screen.getByRole('button', { name: /conjure the book/i }));

      await waitFor(() => {
        expect(mockCreateStory).toHaveBeenCalledWith({
          animalA: 'Lion',
          animalB: 'Tiger',
          artStyle: 'watercolor',
          fierceMode: true,
        });
      });
      await waitFor(() => {
        expect(a).toHaveValue('');
        expect(b).toHaveValue('');
      });
      expect(screen.getByRole('radio', { name: /surprise me/i })).toBeChecked();
    });

    it('stays interactive while createStory is pending (no blocking overlay)', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([]);
      mockCreateStory.mockReturnValue(new Promise(() => {}));
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByLabelText(/first contender/i)).toBeInTheDocument();
      });
      await user.type(screen.getByLabelText(/first contender/i), 'Lion');
      await user.type(screen.getByLabelText(/second contender/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /conjure the book/i }));

      expect(screen.queryByText(/creating your book/i)).not.toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /surprise me/i })).toBeEnabled();
    });

    it('opens the composer overlay from the masthead stamp when a library exists', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([createMockStoryRecord()]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /begin a new matchup/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /begin a new matchup/i }));

      const dialog = screen.getByRole('dialog', { name: /begin a new matchup/i });
      expect(dialog).toBeInTheDocument();
      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('status-aware cards', () => {
    it('renders a ready row with cover, Read, and reveal-winner', async () => {
      mockListStories.mockResolvedValue([createMockStoryRecord()]);
      mockResolveSignedUrls.mockResolvedValue({
        'stories/story-1/cover.png': 'https://signed/cover.png',
      });
      const onReadStory = vi.fn();
      renderDashboard(onReadStory);

      await waitFor(() => {
        expect(screen.getByAltText('Lion vs Tiger')).toHaveAttribute('src', 'https://signed/cover.png');
      });
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /read the book/i }));
      expect(onReadStory).toHaveBeenCalledWith('story-1');
      await user.click(screen.getByRole('button', { name: /reveal winner/i }));
      expect(screen.getByText(/winner: lion/i)).toBeInTheDocument();
    });

    it('renders a failed row with its error and no Read', async () => {
      mockListStories.mockResolvedValue([
        createMockStoryRecord({
          id: 'fail-1',
          status: 'failed',
          title: null,
          manifest: null,
          cover_image_path: null,
          error: 'API quota exceeded',
        }),
      ]);
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByText(/api quota exceeded/i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /read the book/i })).not.toBeInTheDocument();
    });
  });

  describe('realtime transitions', () => {
    it('moves a row from generating to ready on a Realtime UPDATE', async () => {
      mockListStories.mockResolvedValue([
        createMockStoryRecord({
          id: 'story-1',
          status: 'generating',
          title: null,
          manifest: null,
          cover_image_path: null,
          progress: { phase: 'illustrating', page: 8, total: 14 },
        }),
      ]);
      mockResolveSignedUrls.mockResolvedValue({
        'stories/story-1/cover.png': 'https://signed/cover.png',
      });
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
      });
      dispatchRealtime({
        eventType: 'UPDATE',
        new: createMockStoryRecord({ id: 'story-1', status: 'ready' }),
        old: {},
      });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /read the book/i })).toBeInTheDocument();
      });
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('prepends a new row on a Realtime INSERT (deduped by id)', async () => {
      mockListStories.mockResolvedValue([createMockStoryRecord({ id: 'seed-1' })]);
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /begin a new matchup/i })).toBeInTheDocument();
      });

      const inserted = createMockStoryRecord({
        id: 'new-1',
        status: 'generating',
        title: null,
        manifest: null,
        cover_image_path: null,
        progress: { phase: 'queued' },
        animal_a: 'Eagle',
        animal_b: 'Hawk',
      });
      dispatchRealtime({ eventType: 'INSERT', new: inserted, old: {} });
      await waitFor(() => {
        expect(screen.getByText(/eagle vs hawk/i)).toBeInTheDocument();
      });
      dispatchRealtime({ eventType: 'INSERT', new: inserted, old: {} });
      expect(screen.getAllByText(/eagle vs hawk/i)).toHaveLength(1);
    });
  });

  describe('delete', () => {
    it('optimistically removes a story', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([createMockStoryRecord()]);
      mockResolveSignedUrls.mockResolvedValue({
        'stories/story-1/cover.png': 'https://signed/cover.png',
      });
      mockDeleteStory.mockReturnValue(new Promise(() => {}));
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Who Would Win? Lion vs. Tiger')).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /remove story/i }));
      await waitFor(() => {
        expect(screen.queryByText('Who Would Win? Lion vs. Tiger')).not.toBeInTheDocument();
      });
      expect(mockDeleteStory).toHaveBeenCalledWith('story-1');
    });
  });

  describe('browse', () => {
    it('filters by contender name', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([
        createMockStoryRecord({ id: 's1', title: 'Lion vs Tiger', animal_a: 'Lion', animal_b: 'Tiger', cover_image_path: null }),
        createMockStoryRecord({ id: 's2', title: 'Orca vs Shark', animal_a: 'Orca', animal_b: 'Shark', cover_image_path: null }),
      ]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Orca vs Shark')).toBeInTheDocument();
      });
      await user.type(screen.getByLabelText(/search by name/i), 'orca');
      expect(screen.queryByText('Lion vs Tiger')).not.toBeInTheDocument();
      expect(screen.getByText('Orca vs Shark')).toBeInTheDocument();
    });

    it('reorders the shelf when the sort control changes (newest default, then A to Z)', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([
        createMockStoryRecord({ id: 'z1', title: 'Zebra vs Ant', created_at: '2026-06-15T00:00:00.000Z', cover_image_path: null }),
        createMockStoryRecord({ id: 'a1', title: 'Aardvark vs Bee', created_at: '2026-06-10T00:00:00.000Z', cover_image_path: null }),
      ]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Aardvark vs Bee')).toBeInTheDocument();
      });
      // Default newest-first: Zebra (06-15) precedes Aardvark (06-10).
      expect(
        screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
      ).toEqual(['Zebra vs Ant', 'Aardvark vs Bee']);

      await user.selectOptions(screen.getByLabelText(/^sort$/i), 'az');
      expect(
        screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
      ).toEqual(['Aardvark vs Bee', 'Zebra vs Ant']);
    });
  });

  describe('account', () => {
    it('signs out from the masthead account menu', async () => {
      const user = userEvent.setup();
      mockListStories.mockResolvedValue([]);
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /account menu/i }));
      await user.click(screen.getByRole('menuitem', { name: /sign out/i }));
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('provider/model picker removal', () => {
    it('does not render any LLM/image provider or model selector', async () => {
      mockListStories.mockResolvedValue([]);
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByText(/conjure your first matchup/i)).toBeInTheDocument();
      });
      expect(screen.queryByLabelText(/llm provider/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/image provider/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/image model/i)).not.toBeInTheDocument();
    });
  });

  describe('press room and retry', () => {
    it('opens the Press Room from a generating card', async () => {
      mockListStories.mockResolvedValue([
        createMockStoryRecord({
          id: 'g1',
          status: 'generating',
          title: null,
          manifest: null,
          cover_image_path: null,
          progress: { phase: 'illustrating', page: 3, total: 14 },
          animal_a: 'Lion',
          animal_b: 'Wolverine',
        }),
      ]);
      renderDashboard();
      await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument());

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /watch lion vs wolverine being printed/i }));
      expect(screen.getByRole('dialog', { name: /press room/i })).toBeInTheDocument();
    });

    it('retries a failed story with an optimistic flip to generating', async () => {
      mockListStories.mockResolvedValue([
        createMockStoryRecord({
          id: 'fail-1',
          status: 'failed',
          title: null,
          manifest: null,
          cover_image_path: null,
          error: 'boom',
        }),
      ]);
      renderDashboard();
      await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /try again/i }));
      expect(mockRetryStory).toHaveBeenCalledWith('fail-1');
      await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument());
    });
  });
});
