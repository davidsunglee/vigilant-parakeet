-- Storage bucket, Storage RLS policies, and Realtime publication for stories.

-- Step 1: Create the private story-images bucket.
insert into storage.buckets (id, name, public)
values ('story-images', 'story-images', false)
on conflict (id) do nothing;

-- Object layout: stories/{storyId}/cover.png and stories/{storyId}/{pageIndex}.png
-- so storage.foldername(name) yields ARRAY['stories', storyId].

-- Step 2: Owner-scoped SELECT policy.
create policy "Owners can read own story images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'story-images'
    and (storage.foldername(name))[1] = 'stories'
    and exists (
      select 1
      from public.stories s
      where s.id::text = (storage.foldername(name))[2]
        and s.owner_id = (select auth.uid())
    )
  );

-- Step 3: Owner-scoped INSERT, UPDATE, DELETE policies.
-- Note: the generate-story task uploads with the service-role key and bypasses RLS;
-- these policies cover a future authenticated-write path.

create policy "Owners can insert own story images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'story-images'
    and (storage.foldername(name))[1] = 'stories'
    and exists (
      select 1
      from public.stories s
      where s.id::text = (storage.foldername(name))[2]
        and s.owner_id = (select auth.uid())
    )
  );

create policy "Owners can update own story images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'story-images'
    and (storage.foldername(name))[1] = 'stories'
    and exists (
      select 1
      from public.stories s
      where s.id::text = (storage.foldername(name))[2]
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'story-images'
    and (storage.foldername(name))[1] = 'stories'
    and exists (
      select 1
      from public.stories s
      where s.id::text = (storage.foldername(name))[2]
        and s.owner_id = (select auth.uid())
    )
  );

create policy "Owners can delete own story images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'story-images'
    and (storage.foldername(name))[1] = 'stories'
    and exists (
      select 1
      from public.stories s
      where s.id::text = (storage.foldername(name))[2]
        and s.owner_id = (select auth.uid())
    )
  );

-- Step 4: Add stories to the Realtime publication.
-- supabase_realtime exists by default on Supabase projects.
alter publication supabase_realtime add table public.stories;

-- Step 5: Full replica identity so UPDATE payloads carry all columns to subscribers.
alter table public.stories replica identity full;
