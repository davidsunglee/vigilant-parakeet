import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from './Dashboard';
import { createMockStory, createMockStoryWithSurprise } from '../../test/fixtures';
import { AiConfigProvider } from '../../contexts/AiConfigContext';

// --- Mocks ---

vi.mock('../../services/StorageService', () => ({
  StorageService: {
    getAllManifests: vi.fn(),
    getAllStories: vi.fn(),
    saveStory: vi.fn(),
    deleteStory: vi.fn(),
    getStory: vi.fn(),
    updateStory: vi.fn(),
    markAsRead: vi.fn(),
    getStoryPages: vi.fn(),
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

const mockGetAllManifests = StorageService.getAllManifests as ReturnType<typeof vi.fn>;
const mockSaveStory = StorageService.saveStory as ReturnType<typeof vi.fn>;
const mockDeleteStory = StorageService.deleteStory as ReturnType<typeof vi.fn>;
const mockGenerateStory = StoryGeneratorService.generateStory as ReturnType<typeof vi.fn>;

// --- Helpers ---

/** Creates a mock manifest-lite from a full story (strips pages) */
function toLite(story: ReturnType<typeof createMockStory>) {
  const { pages, ...lite } = story;
  return lite;
}

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
  mockGetAllManifests.mockReset();
  mockSaveStory.mockReset();
  mockDeleteStory.mockReset();
  mockGenerateStory.mockReset();
});

// --- Tests ---

describe('Dashboard', () => {
  // ---- Rendering ----

  describe('rendering', () => {
    it('shows "Your library is empty" when there are no stories', async () => {
      mockGetAllManifests.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });
    });

    it('renders story cards with animal names, title, and date', async () => {
      const story = createMockStory();
      mockGetAllManifests.mockResolvedValue([toLite(story)]);
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

    it('renders cover image with lazy loading attributes when coverImageUrl exists', async () => {
      const story = createMockStory({ coverImageUrl: 'http://example.com/cover.png' });
      mockGetAllManifests.mockResolvedValue([toLite(story)]);
      renderDashboard();

      await waitFor(() => {
        const img = screen.getByAltText('Lion vs Tiger');
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', 'http://example.com/cover.png');
        // #4: Lazy loading attributes
        expect(img).toHaveAttribute('loading', 'lazy');
        expect(img).toHaveAttribute('decoding', 'async');
      });
    });

    it('does not render img when coverImageUrl is missing', async () => {
      const story = createMockStory({ coverImageUrl: undefined });
      mockGetAllManifests.mockResolvedValue([toLite(story)]);
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
      mockGetAllManifests.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      const btn = screen.getByRole('button', { name: /generate story/i });
      expect(btn).toBeDisabled();
    });

    it('enables generate button when both inputs have values', async () => {
      const user = userEvent.setup();
      mockGetAllManifests.mockResolvedValue([]);
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
      mockGetAllManifests.mockResolvedValue([]);
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

    it('calls StoryGeneratorService.generateStory with progress callback on form submission', async () => {
      const user = userEvent.setup();
      const newStory = createMockStory();
      mockGetAllManifests.mockResolvedValue([]);
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
          expect.objectContaining({ artStyle: 'surprise', fierceMode: false }),
          expect.any(Function), // #7: progress callback
        );
      });
    });

    it('shows alert on generation error', async () => {
      const user = userEvent.setup();
      mockGetAllManifests.mockResolvedValue([]);
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

    it('optimistically appends new story after generation (#13)', async () => {
      const user = userEvent.setup();
      const newStory = createMockStory();
      mockGetAllManifests.mockResolvedValue([]);
      mockGenerateStory.mockResolvedValue(newStory);
      mockSaveStory.mockResolvedValue(undefined);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText(/animal a/i), 'Lion');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      // Story should appear in the UI via optimistic append
      await waitFor(() => {
        expect(screen.getByText(newStory.metadata.title)).toBeInTheDocument();
      });

      // getAllManifests should have been called only once (initial load), not after generation
      expect(mockGetAllManifests).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Generation Overlay ----

  describe('generation overlay', () => {
    it('shows overlay during generation', async () => {
      const user = userEvent.setup();
      mockGetAllManifests.mockResolvedValue([]);
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
      mockGetAllManifests.mockResolvedValue([]);
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

    it('shows a progress bar with role="progressbar" (#7)', async () => {
      const user = userEvent.setup();
      mockGetAllManifests.mockResolvedValue([]);
      mockGenerateStory.mockReturnValue(new Promise(() => {}));
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText(/animal a/i), 'Lion');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        const bar = screen.getByRole('progressbar');
        expect(bar).toBeInTheDocument();
      });
    });
  });

  // ---- Delete ----

  describe('delete', () => {
    it('optimistically removes story from UI immediately', async () => {
      const user = userEvent.setup();
      const story = createMockStory();
      mockGetAllManifests.mockResolvedValue([toLite(story)]);
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
      mockGetAllManifests.mockResolvedValue([toLite(story)]);
      mockDeleteStory.mockRejectedValue(new Error('Delete failed'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Lion')).toBeInTheDocument();
      });

      // Record calls before delete
      const callsBefore = mockGetAllManifests.mock.calls.length;

      const deleteBtn = screen.getByRole('button', { name: /delete story/i });
      await user.click(deleteBtn);

      // After delete fails, loadStories is called again (at least one more time)
      await waitFor(() => {
        expect(mockGetAllManifests.mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });
  });

  // ---- Winner Reveal ----

  describe('winner reveal', () => {
    it('shows "Reveal Winner" button initially', async () => {
      const story = createMockStory();
      mockGetAllManifests.mockResolvedValue([toLite(story)]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/reveal winner/i)).toBeInTheDocument();
      });
    });

    it('toggles to show winner name on click', async () => {
      const user = userEvent.setup();
      const story = createMockStory(); // winnerId is 'animalA' => Lion
      mockGetAllManifests.mockResolvedValue([toLite(story)]);
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
      mockGetAllManifests.mockResolvedValue([toLite(story)]);
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

  // ---- Art Style Picker ----

  describe('art style picker', () => {
    it('renders the art style picker in the primary input area with Surprise Me selected by default', async () => {
      mockGetAllManifests.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/art style/i) as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      expect(select.value).toBe('surprise');
    });

    it('renders the six art style options in the specified order', async () => {
      mockGetAllManifests.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/art style/i) as HTMLSelectElement;
      const optionLabels = Array.from(select.options).map((o) => o.textContent);
      expect(optionLabels).toEqual([
        'Surprise Me',
        'Watercolor',
        'Colored Pencil Sketch',
        'Storybook Painterly',
        'Graphic Novel',
        '3D Animated',
      ]);
    });

    it('disables the art style picker during generation', async () => {
      const user = userEvent.setup();
      mockGetAllManifests.mockResolvedValue([]);
      mockGenerateStory.mockReturnValue(new Promise(() => {}));
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText(/animal a/i), 'Lion');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/art style/i)).toBeDisabled();
      });
    });

    it('passes the selected art style to generateStory', async () => {
      const user = userEvent.setup();
      const newStory = createMockStory();
      mockGetAllManifests.mockResolvedValue([]);
      mockGenerateStory.mockResolvedValue(newStory);
      mockSaveStory.mockResolvedValue(undefined);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByLabelText(/art style/i), 'watercolor');
      await user.type(screen.getByPlaceholderText(/animal a/i), 'Lion');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(mockGenerateStory).toHaveBeenCalledWith(
          expect.any(Object),
          'Lion',
          'Tiger',
          expect.objectContaining({ artStyle: 'watercolor', fierceMode: false }),
          expect.any(Function),
        );
      });
    });
  });

  // ---- Fierce Mode ----

  describe('fierce mode', () => {
    it('renders the Fierce Mode toggle in Advanced Options, default off', async () => {
      mockGetAllManifests.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      const toggle = screen.getByLabelText(/fierce mode/i) as HTMLInputElement;
      expect(toggle).toBeInTheDocument();
      expect(toggle.type).toBe('checkbox');
      expect(toggle.checked).toBe(false);
    });

    it('disables the Fierce Mode toggle during generation', async () => {
      const user = userEvent.setup();
      mockGetAllManifests.mockResolvedValue([]);
      mockGenerateStory.mockReturnValue(new Promise(() => {}));
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText(/animal a/i), 'Lion');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/fierce mode/i)).toBeDisabled();
      });
    });

    it('passes Fierce Mode through to generateStory when enabled', async () => {
      const user = userEvent.setup();
      const newStory = createMockStory();
      mockGetAllManifests.mockResolvedValue([]);
      mockGenerateStory.mockResolvedValue(newStory);
      mockSaveStory.mockResolvedValue(undefined);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText(/fierce mode/i));
      await user.type(screen.getByPlaceholderText(/animal a/i), 'Lion');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(mockGenerateStory).toHaveBeenCalledWith(
          expect.any(Object),
          'Lion',
          'Tiger',
          expect.objectContaining({ fierceMode: true }),
          expect.any(Function),
        );
      });
    });

    it('resets visual controls to defaults after successful generation', async () => {
      const user = userEvent.setup();
      const newStory = createMockStory();
      mockGetAllManifests.mockResolvedValue([]);
      mockGenerateStory.mockResolvedValue(newStory);
      mockSaveStory.mockResolvedValue(undefined);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your library is empty/i)).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByLabelText(/art style/i), 'graphic-novel');
      await user.click(screen.getByLabelText(/fierce mode/i));
      await user.type(screen.getByPlaceholderText(/animal a/i), 'Lion');
      await user.type(screen.getByPlaceholderText(/animal b/i), 'Tiger');
      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(mockSaveStory).toHaveBeenCalledWith(newStory);
      });

      expect(screen.getByLabelText(/art style/i)).toHaveValue('surprise');
      expect(screen.getByLabelText(/fierce mode/i)).not.toBeChecked();
    });
  });

  // ---- Advanced Options ----

  describe('advanced options', () => {
    it('shows LLM provider selector when multiple providers available', async () => {
      mockGetAllManifests.mockResolvedValue([]);
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
      mockGetAllManifests.mockResolvedValue([]);
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
          expect.objectContaining({ artStyle: 'surprise', fierceMode: false }),
          expect.any(Function),
        );
      });
    });
  });
});
