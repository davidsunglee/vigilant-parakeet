import { describe, it, expect, vi, beforeEach } from 'vitest';

// A chainable query-builder mock plus fake channel/functions/storage. Defined
// via vi.hoisted so it is available when the vi.mock factory is hoisted.
const h = vi.hoisted(() => {
  const calls = {
    from: vi.fn(),
    select: vi.fn(),
    order: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    delete: vi.fn(),
    invoke: vi.fn(),
    channel: vi.fn(),
    on: vi.fn(),
    subscribe: vi.fn(),
    removeChannel: vi.fn(),
    storageFrom: vi.fn(),
    createSignedUrls: vi.fn(),
  };

  const state: {
    queryResult: { data: unknown; error: unknown };
    invokeResult: { data: unknown; error: unknown };
    signedResult: { data: unknown; error: unknown };
  } = {
    queryResult: { data: null, error: null },
    invokeResult: { data: null, error: null },
    signedResult: { data: [], error: null },
  };

  // The builder is chainable and thenable: every method returns the builder,
  // and awaiting it (at any point in the chain) resolves `state.queryResult`.
  const builder: Record<string, (...a: unknown[]) => unknown> = {
    select: (...a) => { calls.select(...a); return builder; },
    order: (...a) => { calls.order(...a); return builder; },
    eq: (...a) => { calls.eq(...a); return builder; },
    single: (...a) => { calls.single(...a); return builder; },
    delete: (...a) => { calls.delete(...a); return builder; },
    then: (resolve: (v: unknown) => unknown) => resolve(state.queryResult),
  };

  const channel: Record<string, (...a: unknown[]) => unknown> = {
    on: (...a) => { calls.on(...a); return channel; },
    subscribe: (...a) => { calls.subscribe(...a); return channel; },
  };

  const storageBucket = {
    createSignedUrls: (...a: unknown[]) => {
      calls.createSignedUrls(...a);
      return Promise.resolve(state.signedResult);
    },
  };

  const supabase = {
    from: (...a: unknown[]) => { calls.from(...a); return builder; },
    functions: {
      invoke: (...a: unknown[]) => { calls.invoke(...a); return Promise.resolve(state.invokeResult); },
    },
    channel: (...a: unknown[]) => { calls.channel(...a); return channel; },
    removeChannel: (...a: unknown[]) => { calls.removeChannel(...a); },
    storage: {
      from: (...a: unknown[]) => { calls.storageFrom(...a); return storageBucket; },
    },
  };

  return { calls, state, supabase, channel };
});

vi.mock('../lib/supabase', () => ({ supabase: h.supabase }));

import { CatalogService } from './CatalogService';

beforeEach(() => {
  vi.clearAllMocks();
  h.state.queryResult = { data: null, error: null };
  h.state.invokeResult = { data: null, error: null };
  h.state.signedResult = { data: [], error: null };
});

describe('CatalogService', () => {
  describe('listStories', () => {
    it('selects all stories from the stories table ordered by created_at desc', async () => {
      h.state.queryResult = {
        data: [{ id: 'a' }, { id: 'b' }],
        error: null,
      };

      const result = await CatalogService.listStories();

      expect(h.calls.from).toHaveBeenCalledWith('stories');
      expect(h.calls.select).toHaveBeenCalledWith('*');
      expect(h.calls.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
    });

    it('throws when the query errors', async () => {
      h.state.queryResult = { data: null, error: new Error('boom') };
      await expect(CatalogService.listStories()).rejects.toThrow('boom');
    });
  });

  describe('getStory', () => {
    it('selects a single story by id', async () => {
      h.state.queryResult = { data: { id: 'story-1' }, error: null };

      const result = await CatalogService.getStory('story-1');

      expect(h.calls.from).toHaveBeenCalledWith('stories');
      expect(h.calls.eq).toHaveBeenCalledWith('id', 'story-1');
      expect(h.calls.single).toHaveBeenCalled();
      expect(result).toEqual({ id: 'story-1' });
    });
  });

  describe('createStory', () => {
    it('invokes the create-story function with the form body and returns storyId', async () => {
      h.state.invokeResult = { data: { storyId: 'new-story-id' }, error: null };

      const id = await CatalogService.createStory({
        animalA: 'Lion',
        animalB: 'Tiger',
        artStyle: 'watercolor',
        fierceMode: true,
      });

      expect(h.calls.invoke).toHaveBeenCalledWith('create-story', {
        body: { animalA: 'Lion', animalB: 'Tiger', artStyle: 'watercolor', fierceMode: true },
      });
      expect(id).toBe('new-story-id');
    });

    it('throws when the function returns an error', async () => {
      h.state.invokeResult = { data: null, error: new Error('unauthorized') };

      await expect(
        CatalogService.createStory({ animalA: 'Lion', animalB: 'Tiger', artStyle: 'watercolor', fierceMode: false }),
      ).rejects.toThrow('unauthorized');
    });
  });

  describe('subscribeToStories', () => {
    it('registers a postgres_changes listener filtered to the owner and subscribes', () => {
      const handler = vi.fn();

      const channel = CatalogService.subscribeToStories('user-123', handler);

      expect(h.calls.channel).toHaveBeenCalledWith('stories:user-123');
      expect(h.calls.on).toHaveBeenCalledWith(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stories',
          filter: 'owner_id=eq.user-123',
        },
        expect.any(Function),
      );
      expect(h.calls.subscribe).toHaveBeenCalled();
      expect(channel).toBe(h.channel);
    });

    it('forwards Realtime payloads to the handler', () => {
      const handler = vi.fn();
      CatalogService.subscribeToStories('user-123', handler);

      // The listener callback is the third arg passed to `.on(...)`.
      const listener = h.calls.on.mock.calls[0][2] as (p: unknown) => void;
      const payload = { eventType: 'UPDATE', new: { id: 'x' } };
      listener(payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });
  });

  describe('resolveSignedUrls', () => {
    it('calls createSignedUrls and maps path -> signedUrl, skipping nulls', async () => {
      h.state.signedResult = {
        data: [
          { path: 'stories/s1/cover.png', signedUrl: 'https://signed/cover', error: null },
          { path: 'stories/s1/1.png', signedUrl: null, error: 'nope' },
          { path: 'stories/s1/2.png', signedUrl: 'https://signed/2', error: null },
        ],
        error: null,
      };

      const map = await CatalogService.resolveSignedUrls(
        ['stories/s1/cover.png', 'stories/s1/1.png', 'stories/s1/2.png'],
        7200,
      );

      expect(h.calls.storageFrom).toHaveBeenCalledWith('story-images');
      expect(h.calls.createSignedUrls).toHaveBeenCalledWith(
        ['stories/s1/cover.png', 'stories/s1/1.png', 'stories/s1/2.png'],
        7200,
      );
      expect(map).toEqual({
        'stories/s1/cover.png': 'https://signed/cover',
        'stories/s1/2.png': 'https://signed/2',
      });
    });

    it('short-circuits to an empty map without calling storage for no paths', async () => {
      const map = await CatalogService.resolveSignedUrls([]);
      expect(map).toEqual({});
      expect(h.calls.createSignedUrls).not.toHaveBeenCalled();
    });

    it('resolveSignedUrl returns the single signed url or null', async () => {
      h.state.signedResult = {
        data: [{ path: 'stories/s1/cover.png', signedUrl: 'https://signed/cover', error: null }],
        error: null,
      };

      const url = await CatalogService.resolveSignedUrl('stories/s1/cover.png');
      expect(url).toBe('https://signed/cover');
    });
  });

  describe('deleteStory', () => {
    it('deletes the story row by id', async () => {
      h.state.queryResult = { data: null, error: null };

      await CatalogService.deleteStory('story-1');

      expect(h.calls.from).toHaveBeenCalledWith('stories');
      expect(h.calls.delete).toHaveBeenCalled();
      expect(h.calls.eq).toHaveBeenCalledWith('id', 'story-1');
    });

    it('throws when the delete errors', async () => {
      h.state.queryResult = { data: null, error: new Error('denied') };
      await expect(CatalogService.deleteStory('story-1')).rejects.toThrow('denied');
    });
  });
});
