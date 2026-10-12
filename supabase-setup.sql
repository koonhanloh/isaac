create table if not exists public.simulator_sync (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.simulator_sync enable row level security;
revoke all on table public.simulator_sync from anon;
grant select, insert, update, delete on table public.simulator_sync to authenticated;

drop policy if exists "signed in users can sync simulator data" on public.simulator_sync;
create policy "signed in users can sync simulator data"
on public.simulator_sync for all to authenticated
using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'simulator_sync'
  ) then
    alter publication supabase_realtime add table public.simulator_sync;
  end if;
end $$;

