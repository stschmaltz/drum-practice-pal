-- Unit 14: songs with recordings. A song gains links to the real recording
-- (one Original, one Drumless, any number of Other), and a "last played" time
-- that opening a recording moves, for the Songs list's "recently practised" order.
--
-- Additive: the build before this one reads none of it and keeps working.

-- song_links -------------------------------------------------------------------

create type public.song_link_kind as enum ('original', 'drumless', 'other');
-- What the app recognised the URL as when it was saved. The app parses the URL
-- again whenever it uses it (src/features/recordings/songLinks.ts), so this is
-- a record, never what an embed or a link out is built from.
create type public.song_link_provider as enum ('youtube', 'spotify', 'web');

create table public.song_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id uuid not null,
  kind public.song_link_kind not null,
  provider public.song_link_provider not null,
  url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- https only, and nothing a URL can't hold. Mirrored by parseSongLink.
  constraint song_links_url_https check (url ~ '^https://\S+$'),
  -- Mirrored by SONG_LINK_URL_MAX_LENGTH in src/lib/schema.ts.
  constraint song_links_url_length check (char_length(url) <= 2048),
  -- By (id, user_id), so a link can never point at another user's song.
  constraint song_links_song_fkey foreign key (song_id, user_id)
    references public.songs (id, user_id) on delete cascade
);

-- One Original and one Drumless per song; Other is a list.
create unique index song_links_one_per_kind
  on public.song_links (song_id, kind) where kind <> 'other';
create index song_links_song_id_idx on public.song_links (song_id);

-- Never taken from the caller, like the loops timestamps.
create function public.song_links_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.song_links_before_write() from public, anon, authenticated;

create trigger song_links_before_write
before insert or update on public.song_links
for each row execute function public.song_links_before_write();

alter table public.song_links enable row level security;

revoke all on public.song_links from anon, authenticated;
grant select, delete on public.song_links to authenticated;
grant insert (id, user_id, song_id, kind, provider, url) on public.song_links to authenticated;
-- A link's song and kind are fixed once it is saved; only where it points changes.
grant update (provider, url) on public.song_links to authenticated;

create policy song_links_select_own on public.song_links
  for select to authenticated using (user_id = (select auth.uid()));
create policy song_links_insert_own on public.song_links
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy song_links_update_own on public.song_links
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy song_links_delete_own on public.song_links
  for delete to authenticated using (user_id = (select auth.uid()));

-- songs.last_played_at -----------------------------------------------------------

alter table public.songs add column last_played_at timestamptz;

-- The client sends its own clock's "now" (the write can wait offline and be
-- sent twice), so the database keeps it honest: it never moves back, so an
-- older write that lands late changes nothing, and it is never in the future,
-- so a phone with a wrong clock can't pin a song to the top of the list.
create function public.songs_keep_last_played()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.last_played_at is null
      or (old.last_played_at is not null and new.last_played_at < old.last_played_at) then
      new.last_played_at = old.last_played_at;
    end if;
  end if;
  if new.last_played_at > now() then
    new.last_played_at = now();
  end if;
  return new;
end;
$$;

revoke execute on function public.songs_keep_last_played() from public, anon, authenticated;

create trigger songs_keep_last_played
before insert or update on public.songs
for each row execute function public.songs_keep_last_played();

-- songs' update grant is per column (title, artist): this adds the one more.
grant update (last_played_at) on public.songs to authenticated;
