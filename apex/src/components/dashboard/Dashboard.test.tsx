import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from './Dashboard';
import { createMockStory, createMockStoryWithSurprise } from '../../test/fixtures';
import { AiConfigProvider } from '../../contexts/AiConfigContext';
import type { IStoryManifest } from '../../types/story.types';

// --- Mocks ---

vi.mock('../../services/StorageService', () => ({
  StorageService: {
    getAllStories: vi.fn(),
    saveStory: vi.fn(),
    deleteStory: vi.fn(),
    getStory: vi.fn(),
    updateStory: vi.fn(),
  },
}));

vi.mock('../../services/StoryGeneratorService', () => ({
  StoryGeneratorService: {
    generateStory: vi.fn(),
  },
}));

// Import mocked modules after vi.mock so we can reference the mocked fns
import { StorageService } from '../../services/StorageService';
import { StoryGeneratorService } from '../../services/StoryGeneratorService';

const mockGetAllStories = StorageService.getAllStories as ReturnType<typeof vi.fn>;
const mockSaveStory = StorageService.saveStory as ReturnType<typeof vi.fn>;
const mockDeleteStory = StorageService.deleteStory as ReturnType<typeof vi.fn>;
const mockGenerateStory = StoryGeneratorService.generateStory as ReturnType<typeof vi.fn>;

// --- Helpers ---

function renderDashboard(onReadStory = vi.fn()) {
  // Mock fetch for AiConfigProvider's /api/providers call
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ llm: ['anthropic', 'openai'], image: ['gemini'] })),
  );

  return render(
    <AiConfigProvider>
      <Dashboard onReadStory={onReadStory} />
    </AiConfigProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockGetAllStories.mockReset();
  mockSaveStory.mockReset();
  mockDeleteStory.mockReset();
  mockGenerateStory.mockReset();
});

// --- Tests ---

describe('Dashboard', () => {
  // ---- Rendering ----

  describe('rendering', () => {
    it('shows "Your library is empty" when there are no stories', async () => {
      mockGetAllStories.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });
    });

    it('renders story cards with animal names, title, and date', async () => {
      const story = createMockStory();
      mockGetAllStories.mockResolvedValue([story]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Lion')).toBeInTheDocument();
      });

      expect(screen.getByText('Tiger')).toBeInTheDocument();
      expect(screen.getByText(story.metadata.title)).toBeInTheDocument();
      expect(
        screen.getByText(new Date(story.metadata.createdAt).toLocaleDateString()),
      ).toBeInTheDocument();
    });

    it('renders cover image when coverImageUrl exists', async () => {
      const story = createMockStory({ coverImageUrl: 'http://example.com/cover.png' });
      mockGetAllStories.mockResolvedValue([story]);
      renderDashboard();

      await waitFor(() => {
        const img = screen.getByAltText('Lion vs Tiger');
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', 'http://example.com/cover.png');
      });
    });

    it('does not render img when coverImageUrl is missing', async () => {
      const story = createMockStory({ coverImageUrl: undefined });
      mockGetAllStories.mockResolvedValue([story]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Lion')).toBeInTheDocument();
      });

      expect(screen.queryByAltText('Lion vs Tiger')).not.toBeInTheDocument();
    });
  });

  // ---- Form ----

  describe('form', () => {
    it('disables generate button when inputs are empty', async () => {
      mockGetAllStories.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      const btn = screen.getByRole('button', { name: /generate story/i });
      expect(btn).toBeDisabled();
    });

    it('enables generate button when both inputs have values', async () => {
      const user = userEvent.setup();
      mockGetAllStories.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText(/animal a/i), 'Lion');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Tiger');

      const btn = screen.getByRole('button', { name: /generate story/i });
      expect(btn).toBeEnabled();
    });

    it('disables inputs during generation', async () => {
      const user = userEvent.setup();
      mockGetAllStories.mockResolvedValue([]);
      // generateStory never resolves, keeping isGenerating true
      mockGenerateStory.mockReturnValue(new Promise(() => {}));
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      const inputA = screen.getByPlaceholderText(/animal a/i);
      const inputB = screen.getByPlaceholderText(/animal b/i);

      await user.type(inputA, 'Lion');
      await user.type(inputB, 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(inputA).toBeDisabled();
        expect(inputB).toBeDisabled();
      });
    });

    it('calls StoryGeneratorService.generateStory on form submission', async () => {
      const user = userEvent.setup();
      const newStory = createMockStory();
      mockGetAllStories.mockResolvedValue([]);
      mockGenerateStory.mockResolvedValue(newStory);
      mockSaveStory.mockResolvedValue(undefined);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText(/animal a/i), 'Lion');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(mockGenerateStory).toHaveBeenCalledWith(
          expect.objectContaining({ llmProvider: expect.any(String) }),
          'Lion',
          'Tiger',
        );
      });
    });

    it('shows alert on generation error', async () => {
      const user = userEvent.setup();
      mockGetAllStories.mockResolvedValue([]);
      mockGenerateStory.mockRejectedValue(new Error('API failed'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText(/animal a/i), 'Lion');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Failed to generate story.');
      });
    });
  });

  // ---- Generation Overlay ----

  describe('generation overlay', () => {
    it('shows overlay during generation', async () => {
      const user = userEvent.setup();
      mockGetAllStories.mockResolvedValue([]);
      mockGenerateStory.mockReturnValue(new Promise(() => {}));
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText(/animal a/i), 'Lion');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(screen.getByText('Creating Your Book')).toBeInTheDocument();
      });
    });

    it('shows animal names in overlay', async () => {
      const user = userEvent.setup();
      mockGetAllStories.mockResolvedValue([]);
      mockGenerateStory.mockReturnValue(new Promise(() => {}));
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText(/animal a/i), 'Elephant');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Rhino');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(screen.getByText('Creating Your Book')).toBeInTheDocument();
      });

      const versus = screen.getByText(/elephant/i).closest('.generation-versus');
      expect(versus).toHaveTextContent(/elephant/i);
      expect(versus).toHaveTextContent(/rhino/i);
    });
  });

  // ---- Delete ----

  describe('delete', () => {
    it('optimistically removes story from UI immediately', async () => {
      const user = userEvent.setup();
      const story = createMockStory();
      mockGetAllStories.mockResolvedValue([story]);
      // deleteStory never resolves so we can test optimistic removal
      mockDeleteStory.mockReturnValue(new Promise(() => {}));
      vi.spyOn(console, 'log').mockImplementation(() => {});

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Lion')).toBeInTheDocument();
      });

      const deleteBtn = screen.getByRole('button', { name: /delete story/i });
      await user.click(deleteBtn);

      await waitFor(() => {
        expect(screen.queryByText(story.metadata.title)).not.toBeInTheDocument();
      });
    });

    it('reloads stories when delete fails', async () => {
      const user = userEvent.setup();
      const story = createMockStory();
      mockGetAllStories.mockResolvedValue([story]);
      mockDeleteStory.mockRejectedValue(new Error('Delete failed'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Lion')).toBeInTheDocument();
      });

      // Record calls before delete
      const callsBefore = mockGetAllStories.mock.calls.length;

      const deleteBtn = screen.getByRole('button', { name: /delete story/i });
      await user.click(deleteBtn);

      // After delete fails, loadStories is called again (at least one more time)
      await waitFor(() => {
        expect(mockGetAllStories.mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });
  });

  // ---- Winner Reveal ----

  describe('winner reveal', () => {
    it('shows "Reveal Winner" button initially', async () => {
      const story = createMockStory();
      mockGetAllStories.mockResolvedValue([story]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/reveal winner/i)).toBeInTheDocument();
      });
    });

    it('toggles to show winner name on click', async () => {
      const user = userEvent.setup();
      const story = createMockStory(); // winnerId is 'animalA' => Lion
      mockGetAllStories.mockResolvedValue([story]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/reveal winner/i)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/reveal winner/i));

      await waitFor(() => {
        expect(screen.getByText(/winner: lion/i)).toBeInTheDocument();
      });
    });

    it('shows "None (Surprise!)" for surprise ending', async () => {
      const user = userEvent.setup();
      const story = createMockStoryWithSurprise();
      mockGetAllStories.mockResolvedValue([story]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/reveal winner/i)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/reveal winner/i));

      await waitFor(() => {
        expect(screen.getByText(/none \(surprise!\)/i)).toBeInTheDocument();
      });
    });
  });

  // ---- Advanced Options ----

  describe('advanced options', () => {
    it('shows LLM provider selector when multiple providers available', async () => {
      mockGetAllStories.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      // Wait for providers to load (anthropic + openai)
      await waitFor(() => {
        expect(screen.getByLabelText(/llm provider/i)).toBeInTheDocument();
      });
    });

    it('updates config when selector changes', async () => {
      const user = userEvent.setup();
      const newStory = createMockStory();
      mockGetAllStories.mockResolvedValue([]);
      mockGenerateStory.mockResolvedValue(newStory);
      mockSaveStory.mockResolvedValue(undefined);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByLabelText(/llm provider/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/llm provider/i);
      await user.selectOptions(select, 'openai');

      // Now generate to verify the config was passed with the new provider
      await user.type(screen.getByPlaceholderText(/animal a/i), 'Lion');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(mockGenerateStory).toHaveBeenCalledWith(
          expect.objectContaining({ llmProvider: 'openai' }),
          'Lion',
          'Tiger',
        );
      });
    });
  });
});
