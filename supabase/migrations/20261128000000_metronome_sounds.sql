-- Metronome sounds: which soundfont percussion sound clicks the beats, which
-- one (if any) marks beat one, and whether the beats are split into 8ths or 16ths.
--
-- The names are the app's; src/features/player/metronomeSounds.ts maps each to
-- its General MIDI percussion key. Mirrored by METRONOME_SOUNDS and
-- METRONOME_SUBDIVISIONS in src/lib/schema.ts.

create type public.metronome_sound as enum (
  'click',
  'side_stick',
  'hi_hat',
  'cowbell',
  'claves',
  'woodblock_high',
  'woodblock_low'
);

-- The defaults keep today's click, with beat one played louder.
alter table public.user_settings
  add column metronome_sound public.metronome_sound not null default 'click',
  add column metronome_accent boolean not null default true,
  add column metronome_accent_sound public.metronome_sound not null default 'click',
  add column metronome_subdivision integer not null default 1
    check (metronome_subdivision in (1, 2, 4));

-- The table's grants (select, update to authenticated) are table-wide, so the
-- new columns are covered; anon still has nothing.
