-- Unit 19: the tab follows the video. A link gains the second of its video at
-- which the tab's bar 1 starts, set once by "Bar 1 starts now" and moved by
-- the nudges. Null until the link is lined up.
--
-- Additive: the build before this one names its columns in every select and
-- never sends this one. The build that ships with it selects the column on a
-- song's screens, so this is pushed before that build is live (docs/release.md).

alter table public.song_links
  add column bar_one_seconds numeric,
  -- Mirrored by BAR_ONE_SECONDS_MAX in src/lib/schema.ts: within a 12-hour video.
  add constraint song_links_bar_one_range
    check (bar_one_seconds is null or (bar_one_seconds >= 0 and bar_one_seconds <= 43200));

-- The offset belongs to the video it was lined up on. A link pointed somewhere
-- else (the recordings form, this build's or the one before it, which doesn't
-- know the column) loses it, unless the same write sets a new one.
create or replace function public.song_links_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
  end if;
  if tg_op = 'UPDATE' then
    if new.url is distinct from old.url
      and new.bar_one_seconds is not distinct from old.bar_one_seconds then
      new.bar_one_seconds = null;
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

-- create or replace keeps the function's privileges; said again so this file
-- stands on its own.
revoke execute on function public.song_links_before_write() from public, anon, authenticated;

-- Column grants are per column: these add the one more to each.
grant insert (bar_one_seconds) on public.song_links to authenticated;
grant update (bar_one_seconds) on public.song_links to authenticated;
