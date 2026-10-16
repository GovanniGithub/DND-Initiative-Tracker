insert into storage.buckets (id, name, public)
values ('combat-portraits', 'combat-portraits', true)
on conflict (id) do update set public = true;

drop policy if exists "combat portraits public read" on storage.objects;
create policy "combat portraits public read"
  on storage.objects for select
  using (bucket_id = 'combat-portraits');

drop policy if exists "combat portraits owner insert" on storage.objects;
create policy "combat portraits owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'combat-portraits'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "combat portraits owner update" on storage.objects;
create policy "combat portraits owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'combat-portraits'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'combat-portraits'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
