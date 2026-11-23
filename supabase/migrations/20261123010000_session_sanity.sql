-- Unit 09: practice sessions become client-written, so bound what a client can log.
--
-- A session moves its loop's last_practiced_at forward to started_at +
-- duration_seconds, and that column never moves back. Until now nothing bounded
-- either value, so one session from a phone with a wrong clock (or a tab left
-- "playing" for a week) pinned a loop to the top of On the go for good.

-- Duration ----------------------------------------------------------------------

-- No sitting lasts a day. Mirrored by SESSION_MAX_DURATION_SECONDS in src/lib/schema.ts.
alter table public.practice_sessions
  add constraint practice_sessions_duration_max check (duration_seconds <= 86400);

-- Start time --------------------------------------------------------------------

-- A trigger, not a check constraint: the bound depends on now(), which a check
-- must not (it would be re-evaluated on restore). A day of slack covers time
-- zones and a clock that is merely off; anything later is a broken clock.
-- The past is left open: an offline queue (Unit 11) may replay old sessions.
create function public.practice_sessions_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.started_at > now() + interval '1 day' then
    raise exception 'started_at % is more than a day ahead', new.started_at
      using errcode = 'check_violation', constraint = 'practice_sessions_started_at_not_future';
  end if;
  -- Never taken from the caller, like the loops timestamps.
  new.created_at = now();
  return new;
end;
$$;

revoke execute on function public.practice_sessions_before_insert() from public, anon, authenticated;

create trigger practice_sessions_before_insert
before insert on public.practice_sessions
for each row execute function public.practice_sessions_before_insert();

-- Grants ------------------------------------------------------------------------

-- Only the columns the app sends. The id is the client's, so a retry of the
-- same session is a duplicate key the client ignores ("on conflict do nothing").
revoke insert on public.practice_sessions from authenticated;
grant insert (id, user_id, loop_id, started_at, duration_seconds, speed_ratio, repeats)
  on public.practice_sessions to authenticated;
