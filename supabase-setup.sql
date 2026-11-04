-- Geospatial blog: run once in Supabase -> SQL Editor
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  summary     text check (char_length(summary) <= 400),
  body        text not null check (char_length(body) <= 50000),
  tags        text[] not null default '{}',
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  place_name  text check (char_length(place_name) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists posts_created_idx on public.posts (created_at desc);

alter table public.posts enable row level security;

-- Anyone (including anonymous visitors) can read
drop policy if exists "posts are public" on public.posts;
create policy "posts are public" on public.posts
  for select using (true);

-- Logged-in users can create posts as themselves
drop policy if exists "logged in can insert" on public.posts;
create policy "logged in can insert" on public.posts
  for insert to authenticated with check (author_id = auth.uid());

-- Logged-in users can edit / delete their own posts
drop policy if exists "owner can update" on public.posts;
create policy "owner can update" on public.posts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "owner can delete" on public.posts;
create policy "owner can delete" on public.posts
  for delete to authenticated using (author_id = auth.uid());

-- Keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();
