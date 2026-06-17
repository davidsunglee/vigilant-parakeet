-- Migration: create stories table with RLS and updated_at trigger
-- pod_id uuid is intentionally reserved for a later slice and not added now.

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'generating' check (status in ('generating','ready','failed')),
  animal_a text not null,
  animal_b text not null,
  title text,
  art_style text not null default 'watercolor',
  fierce_mode boolean not null default false,
  cover_image_path text,
  manifest jsonb,
  progress jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger function to keep updated_at current on every row update
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger stories_set_updated_at
  before update on public.stories
  for each row
  execute function public.set_updated_at();

-- Grant table privileges to API roles; RLS below still scopes authenticated client rows per owner.
grant select, insert, update, delete on public.stories to authenticated;
grant select, insert, update, delete on public.stories to service_role;

-- Enable row-level security
alter table public.stories enable row level security;

-- Per-owner RLS policies
create policy "Owners can select own stories"
  on public.stories
  for select
  using ((select auth.uid()) = owner_id);

create policy "Owners can insert own stories"
  on public.stories
  for insert
  with check ((select auth.uid()) = owner_id);

create policy "Owners can update own stories"
  on public.stories
  for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can delete own stories"
  on public.stories
  for delete
  using ((select auth.uid()) = owner_id);

-- Index for catalog listing ordered by creation time
create index stories_owner_created_idx on public.stories (owner_id, created_at desc);
