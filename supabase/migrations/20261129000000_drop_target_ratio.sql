-- Every loop's target is full speed (100%), so it is no longer stored per loop.
-- The column-level grants on target_ratio go with the column. Not additive: fine
-- while the app has no users; once it has, a drop waits until no client selects it.
alter table public.loops drop column target_ratio;
