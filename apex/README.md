# Apex Predator Confrontation

A generative educational narrative engine that creates illustrated storybooks in the style of Jerry Pallotta's *"Who Would Win?"* series. Users authenticate, start a generation (which runs server-side), close the tab, and return later to read completed books — all persisted durably in a multi-user backend.

## ✨ Features

- **Durable Story Generation** — Generations run server-side via Trigger.dev and survive browser closure; checkpointed so retries don't re-pay
- **AI-Generated Narratives** — 26+ page educational stories with 12 comparative aspects (habitat, size, weapons, speed, intelligence, etc.) via Claude Sonnet 4
- **AI Illustrations** — Every page gets a unique, children's book-style illustration via GPT-4 Vision (medium quality for cost efficiency)
- **Live Progress Tracking** — Real-time progress bar and step indicators via Supabase Realtime while generation runs
- **Multi-User Library** — Books are catalogued per user, stored securely in Postgres with row-level security (RLS)
- **Interactive Book Viewer** — Page-flip reading experience powered by `react-pageflip`, rendering from Supabase Storage signed URLs
- **Spoiler-Free Dashboard** — Winner is hidden behind a "Reveal Winner" toggle to preserve suspense
- **Surprise Endings** — 1-in-7 chance of a non-standard outcome (external event, mutual retreat, etc.)

## 🏗 Architecture

```
apex/src/
├── App.tsx                          # Root component, wraps in AuthProvider, routes between SignIn ↔ Dashboard ↔ BookViewer
├── main.tsx                         # React entry point
├── index.css                        # Global design system & component styles
│
├── components/
│   ├── auth/
│   │   ├── SignIn.tsx               # Email magic link + Google OAuth sign-in
│   │   └── SignIn.css               # Sign-in styling
│   ├── dashboard/
│   │   └── Dashboard.tsx            # Story creation form, live library grid, live progress on Realtime
│   └── book/
│       ├── BookViewer.tsx           # Flip-book reader with cover, pages, checklist
│       └── BookViewer.css           # Book-specific styles (pages, cover, checklist)
│
├── contexts/
│   └── AuthContext.tsx              # Session state, signInWithEmail, signInWithGoogle, signOut
│
├── services/
│   └── CatalogService.ts            # Postgres queries (list/get/create/delete), Realtime subscriptions, signed-URL resolution
│
├── lib/
│   └── supabase.ts                  # Browser Supabase client (public anon key)
│
└── types/
    └── story.types.ts               # TypeScript interfaces for manifest + StoryRecord (Postgres row)
```

### Data Model

The core data structure is `IStoryManifest` (same 26-page shape as before) plus `StoryRecord` (the Postgres row):

```typescript
StoryRecord {
  id: uuid                        // Primary key
  owner_id: uuid                  // References auth.users, RLS-scoped to current user
  status: 'generating'|'ready'|'failed'
  animal_a, animal_b: string
  title: string | null
  art_style: string
  fierce_mode: boolean
  cover_image_path: string | null  // Supabase Storage path: stories/{storyId}/cover.png
  manifest: IStoryManifest | null
  progress_step: string            // Current generation step (e.g., "Generating cover image")
  progress_pct: number             // 0–100
  error: string | null             // Terminal failure message
  created_at, updated_at: timestamp
}
```

## 🔀 Generation Flow

1. **User creates story:** Client calls Edge Function via `CatalogService.createStory()`
2. **Edge Function verifies JWT** and inserts `stories` row with `status='generating'`
3. **Edge Function triggers Trigger.dev task** and returns the new `storyId` immediately (non-blocking)
4. **Task runs server-side:** Generates narrative (Claude Sonnet 4) + images (GPT-4 Vision, medium quality), writes progress to `stories` row
5. **Client subscribes to Realtime:** Watches `stories` row; displays live progress bar + step text as `progress_pct`/`progress_step` update
6. **On completion:** Task updates `manifest`, `cover_image_path`, and `status='ready'` → Dashboard transitions card to ready state
7. **User reads:** BookViewer loads row, resolves Storage paths to signed URLs (1-hour TTL), renders cover + 26 pages

### Checkpoint-Based Resumption

- **Narrative phases** (profiles, aspects, outcome) persist their output to `stories.manifest` and are skipped on re-run if present
- **Images** check Storage before generation; if present, reused (skip-if-exists)
- **Result:** Retries re-pay only for incomplete images, not the entire pipeline

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 18 + TypeScript |
| **Build** | Vite 5 |
| **AI (Text)** | Claude Sonnet 4 via Anthropic SDK (runs in Trigger.dev, not client) |
| **AI (Images)** | GPT-4 Vision (medium quality) via OpenAI SDK (runs in Trigger.dev, not client) |
| **Catalog & Auth** | Supabase (Postgres + Auth + Storage + Realtime) |
| **Durable Task** | Trigger.dev (runs `generate-story` task server-side with automatic retry) |
| **Hosting** | Vercel (SPA catch-all rewrite to `/index.html`) |
| **Book Viewer** | `react-pageflip` |
| **Icons** | `lucide-react` |

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (local or hosted)
- Trigger.dev account (cloud)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/vigilant-parakeet.git
cd vigilant-parakeet/apex

# Install dependencies
npm install

# Add your Supabase public credentials
echo "VITE_SUPABASE_URL=https://your-project.supabase.co" > .env
echo "VITE_SUPABASE_ANON_KEY=your_anon_key" >> .env

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build

```bash
npm run build     # TypeScript check + Vite production build
npm run preview   # Preview the production build locally
```

**Vercel deployment:** Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in the Vercel project settings. Build command: `npm run build` from `apex/`. Output: `dist/`.

## 🔐 Authentication & Secrets

- **Client env** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`): Public; RLS protects data on the server
- **Edge Function secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `TRIGGER_SECRET_KEY`): Set via `supabase secrets set` and `supabase functions secrets set`; never shipped to the browser
- **Trigger.dev env** (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`): Set in the Trigger.dev project settings; held server-side only

## 🎨 Design

- **Dark theme** with a curated color palette (`--bg-color: #0f1219`, accent purple + warm orange)
- **Glassmorphism** effects on the generation loading overlay
- **Progress bar** with cycling status messages during story generation (from Realtime updates)
- **Book-style pages** with warm parchment tones (`#f7f3e8`) for an authentic reading feel
- **Page flip animations** via `react-pageflip` for an interactive reading experience
- **Responsive grid layout** for the story library dashboard, real-time updates via Realtime
