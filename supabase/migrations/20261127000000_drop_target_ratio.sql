-- Every loop's target is full speed (100%), so it is no longer stored per loop.
-- The column-level grants on target_ratio go with the column.
alter table public.loops drop column target_ratio;
