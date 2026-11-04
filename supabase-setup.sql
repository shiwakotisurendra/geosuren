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

-- ---------------------------------------------------------------
-- Comments: anyone can submit; hidden until the post's author approves
-- ---------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 80),
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  approved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists comments_post_idx on public.comments (post_id, created_at);

alter table public.comments enable row level security;

-- Visitors see approved comments only
drop policy if exists "approved comments are public" on public.comments;
create policy "approved comments are public" on public.comments
  for select using (approved = true);

-- The author of a post sees every comment on it (including pending)
drop policy if exists "post author sees all comments" on public.comments;
create policy "post author sees all comments" on public.comments
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

-- Anyone may submit a comment, but only as "pending"
drop policy if exists "anyone can submit pending comment" on public.comments;
create policy "anyone can submit pending comment" on public.comments
  for insert to anon, authenticated with check (approved = false);

-- Only the post's author can approve or delete
drop policy if exists "post author can approve" on public.comments;
create policy "post author can approve" on public.comments
  for update to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

drop policy if exists "post author can delete comments" on public.comments;
create policy "post author can delete comments" on public.comments
  for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

-- ---------------------------------------------------------------
-- Contact form messages: anyone can send; only the owner can read/delete
-- (replace the e-mail below if you ever change your login e-mail)
-- ---------------------------------------------------------------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 100),
  email      text not null check (char_length(email) between 3 and 200),
  subject    text check (char_length(subject) <= 200),
  message    text not null check (char_length(btrim(message)) between 1 and 5000),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

drop policy if exists "anyone can send a message" on public.messages;
create policy "anyone can send a message" on public.messages
  for insert to anon, authenticated with check (true);

drop policy if exists "owner reads messages" on public.messages;
create policy "owner reads messages" on public.messages
  for select to authenticated using ((auth.jwt() ->> 'email') = 'shiwakotisurendra@gmail.com');

drop policy if exists "owner deletes messages" on public.messages;
create policy "owner deletes messages" on public.messages
  for delete to authenticated using ((auth.jwt() ->> 'email') = 'shiwakotisurendra@gmail.com');

-- ---------------------------------------------------------------
-- Media uploads for blog posts (images up to 50 MB, mp4/webm video)
-- Public bucket: anyone can view files; only the owner can upload/delete.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-media', 'blog-media', true, 52428800,
        array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do update
  set public = true, file_size_limit = 52428800,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'];

drop policy if exists "owner uploads blog media" on storage.objects;
create policy "owner uploads blog media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'blog-media' and (auth.jwt() ->> 'email') = 'shiwakotisurendra@gmail.com');

drop policy if exists "owner deletes blog media" on storage.objects;
create policy "owner deletes blog media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'blog-media' and (auth.jwt() ->> 'email') = 'shiwakotisurendra@gmail.com');
