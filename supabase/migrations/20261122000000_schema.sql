-- Unit 02: core schema. See the Data model section of docs/plan.md.
--
-- Ownership model: every row carries user_id, RLS scopes it to auth.uid(),
-- and child tables reference their parent by (id, user_id) so a row can never
-- point at another user's parent even though FK checks bypass RLS.

create type public.loop_status as enum ('active', 'finished');
create type public.count_in_mode as enum ('start', 'every_repeat');

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- songs ----------------------------------------------------------------------

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  artist text not null default '' check (char_length(artist) <= 300),
  -- Path inside the gp-files bucket. Pinned to {user_id}/{id}.gp so a row can
  -- only ever name its owner's file.
  file_path text not null,
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  original_tempo numeric not null check (original_tempo > 0 and original_tempo <= 1000),
  bar_count integer not null check (bar_count >= 1),
  drum_track_index integer check (drum_track_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint songs_file_path_matches_owner
    check (file_path = user_id::text || '/' || id::text || '.gp'),
  constraint songs_user_file_hash_key unique (user_id, file_hash),
  constraint songs_id_user_id_key unique (id, user_id)
);

create trigger songs_set_updated_at
before update on public.songs
for each row execute function public.set_updated_at();

-- loops ----------------------------------------------------------------------

create table public.loops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id uuid not null,
  name text not null check (char_length(name) between 1 and 100),
  start_bar integer not null,
  end_bar integer not null,
  speed_ratio numeric not null default 1.0 check (speed_ratio between 0.25 and 2.0),
  target_ratio numeric check (target_ratio between 0.25 and 2.0),
  status public.loop_status not null default 'active',
  finished_at timestamptz,
  last_practiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- end_bar <= songs.bar_count is cross-table, so it's enforced by trigger below.
  constraint loops_bar_range check (start_bar >= 1 and start_bar <= end_bar),
  constraint loops_finished_at_matches_status
    check ((status = 'finished') = (finished_at is not null)),
  constraint loops_id_user_id_key unique (id, user_id),
  constraint loops_song_fkey foreign key (song_id, user_id)
    references public.songs (id, user_id) on delete cascade
);

create index loops_song_id_idx on public.loops (song_id);
create index loops_user_status_practiced_idx
  on public.loops (user_id, status, last_practiced_at desc nulls last);

create function public.loops_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  song_bar_count integer;
begin
  select s.bar_count into song_bar_count from public.songs s where s.id = new.song_id;
  -- A missing song is left for the FK to report.
  if song_bar_count is not null and new.end_bar > song_bar_count then
    raise exception 'end_bar % is past the last bar (%) of the song', new.end_bar, song_bar_count
      using errcode = 'check_violation', constraint = 'loops_end_bar_within_song';
  end if;

  -- Callers only flip status; finished_at follows it.
  if new.status = 'finished' and new.finished_at is null then
    new.finished_at = now();
  elsif new.status = 'active' then
    new.finished_at = null;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create trigger loops_before_write
before insert or update on public.loops
for each row execute function public.loops_before_write();

-- practice_sessions ----------------------------------------------------------

-- Append-only: no update policy. The id is generated client-side so a queued
-- offline write can be retried with "on conflict do nothing".
create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  loop_id uuid not null,
  started_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  speed_ratio numeric not null check (speed_ratio between 0.25 and 2.0),
  repeats integer not null default 0 check (repeats >= 0),
  created_at timestamptz not null default now(),
  constraint practice_sessions_loop_fkey foreign key (loop_id, user_id)
    references public.loops (id, user_id) on delete cascade
);

create index practice_sessions_loop_started_idx
  on public.practice_sessions (loop_id, started_at desc);

-- Keeps loops.last_practiced_at in step with the log, so an offline queue only
-- has to replay the session insert.
create function public.practice_sessions_after_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ended_at timestamptz := new.started_at + make_interval(secs => new.duration_seconds);
begin
  update public.loops l
  set last_practiced_at = ended_at
  where l.id = new.loop_id
    and (l.last_practiced_at is null or l.last_practiced_at < ended_at);
  return null;
end;
$$;

create trigger practice_sessions_after_insert
after insert on public.practice_sessions
for each row execute function public.practice_sessions_after_insert();

-- user_settings --------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  metronome_on boolean not null default true,
  metronome_volume numeric not null default 0.8 check (metronome_volume between 0 and 1),
  count_in_bars integer not null default 0 check (count_in_bars in (0, 1, 2)),
  count_in_mode public.count_in_mode not null default 'start',
  drums_muted_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

-- Runs as the table owner because new users can't insert their own row (there
-- is no insert policy on user_settings).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Row-level security ---------------------------------------------------------

alter table public.songs enable row level security;
alter table public.loops enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.user_settings enable row level security;

-- Supabase's default privileges give anon and authenticated full access to every
-- new public table. Revoke them and grant per table, so signed-out (anon)
-- requests can't touch app tables at all and each grant is a deliberate choice.
revoke all on public.songs, public.loops, public.practice_sessions, public.user_settings
  from anon, authenticated;
-- Song metadata other than title and artist comes from the file and is fixed.
grant select, insert, delete on public.songs to authenticated;
grant update (title, artist) on public.songs to authenticated;
grant select, insert, update, delete on public.loops to authenticated;
grant select, insert on public.practice_sessions to authenticated;
grant select, update on public.user_settings to authenticated;

create policy songs_select_own on public.songs
  for select to authenticated using (user_id = (select auth.uid()));
create policy songs_insert_own on public.songs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy songs_update_own on public.songs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy songs_delete_own on public.songs
  for delete to authenticated using (user_id = (select auth.uid()));

create policy loops_select_own on public.loops
  for select to authenticated using (user_id = (select auth.uid()));
create policy loops_insert_own on public.loops
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy loops_update_own on public.loops
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy loops_delete_own on public.loops
  for delete to authenticated using (user_id = (select auth.uid()));

create policy practice_sessions_select_own on public.practice_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy practice_sessions_insert_own on public.practice_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy user_settings_select_own on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
