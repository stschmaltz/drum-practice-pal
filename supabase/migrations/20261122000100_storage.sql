-- Unit 02: private bucket for uploaded Guitar Pro files.
-- Objects live at {user_id}/{song_id}.gp; the first path segment is the owner.
-- Files aren't tied to songs rows, so deleting a song must remove its file too.

insert into storage.buckets (id, name, public, file_size_limit)
values ('gp-files', 'gp-files', false, 20 * 1024 * 1024)
on conflict (id) do nothing;

create policy gp_files_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'gp-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Writes must also match the exact {user_id}/{uuid}.gp shape, so nothing else
-- (nested folders, other extensions) ends up in the bucket. The same pattern is
-- repeated in the update policy below; change both together.
create policy gp_files_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'gp-files'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.gp$')
  );

create policy gp_files_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'gp-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'gp-files'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.gp$')
  );

create policy gp_files_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'gp-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
