-- Unit 08: loops become client-written, so tighten what a client can write.
--
-- Until now `authenticated` could insert and update every loops column,
-- including finished_at, last_practiced_at, created_at and updated_at. Those
-- belong to the database: the triggers below set them.

-- Names -----------------------------------------------------------------------

-- '   ' passed the length checks. The app trims; this stops a blank name at the DB.
alter table public.loops
  add constraint loops_name_not_blank check (name ~ '\S');
alter table public.songs
  add constraint songs_title_not_blank check (title ~ '\S');

-- Timestamps and derived columns ------------------------------------------------

create or replace function public.loops_before_write()
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

  -- Never taken from the caller, whoever it is: "last write wins" needs the server's clock.
  if tg_op = 'INSERT' then
    new.created_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.loops_before_write() from public, anon, authenticated;

-- Runs as the table owner: the signed-in user can no longer write
-- last_practiced_at (see the grants below). The (loop_id, user_id) foreign key
-- already ties the session to its owner's loop; matching user_id here as well
-- means this can never touch another user's row now that RLS doesn't apply.
create or replace function public.practice_sessions_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended_at timestamptz := new.started_at + make_interval(secs => new.duration_seconds);
begin
  update public.loops l
  set last_practiced_at = ended_at
  where l.id = new.loop_id
    and l.user_id = new.user_id
    and (l.last_practiced_at is null or l.last_practiced_at < ended_at);
  return null;
end;
$$;

revoke execute on function public.practice_sessions_after_insert() from public, anon, authenticated;

-- Grants ------------------------------------------------------------------------

-- Only the columns the app writes. status is here for finish and reopen (Unit 09);
-- finished_at follows it in the trigger above.
revoke insert, update on public.loops from authenticated;
grant insert (id, user_id, song_id, name, start_bar, end_bar, speed_ratio, target_ratio, status)
  on public.loops to authenticated;
grant update (name, start_bar, end_bar, speed_ratio, target_ratio, status)
  on public.loops to authenticated;
