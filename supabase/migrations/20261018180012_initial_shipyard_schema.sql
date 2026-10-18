-- Shipyard Progress initial schema.
-- Every row belongs to its creator; RLS keeps data private to that signed-in user.

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vessel text not null,
  title text not null,
  description text not null default '',
  record_type text not null check (record_type in ('Задача', 'Блокер', 'Замечание', 'Встреча')),
  status text not null default 'Открыта' check (status in ('Открыта', 'В работе', 'Ожидание', 'Закрыта')),
  priority text not null default 'Средний' check (priority in ('Высокий', 'Средний', 'Низкий')),
  deck text not null default '',
  zone text not null default '',
  frame_number text not null default '',
  longitudinal_side text not null default '' check (longitudinal_side in ('', 'Центр', 'Лево', 'Право')),
  longitudinal_number integer check (longitudinal_number is null or longitudinal_number >= 0),
  due_at date,
  assigned_to text not null default '',
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blocker_requires_photo check (record_type <> 'Блокер' or photo_path is not null)
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  role text not null default '',
  vessel text not null default '',
  deck text not null default '',
  zone text not null default '',
  current_task text not null default '',
  available_at time,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.zone_progress (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vessel text not null,
  deck text not null default '',
  zone text not null,
  trade text not null default 'HVAC',
  total_meters numeric(10, 2) not null default 0 check (total_meters >= 0),
  completed_meters numeric(10, 2) not null default 0 check (completed_meters >= 0 and completed_meters <= total_meters),
  updated_at timestamptz not null default now(),
  unique (owner_id, vessel, deck, zone, trade)
);

create table public.work_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vessel text not null,
  deck text not null default '',
  zone text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create index work_items_owner_vessel_status_idx on public.work_items (owner_id, vessel, status);
create index work_items_owner_due_idx on public.work_items (owner_id, due_at) where due_at is not null;
create index team_members_owner_vessel_idx on public.team_members (owner_id, vessel, is_active);
create index zone_progress_owner_vessel_idx on public.zone_progress (owner_id, vessel);
create index work_notes_owner_created_idx on public.work_notes (owner_id, created_at desc);

alter table public.work_items enable row level security;
alter table public.team_members enable row level security;
alter table public.zone_progress enable row level security;
alter table public.work_notes enable row level security;

grant select, insert, update, delete on public.work_items to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;
grant select, insert, update, delete on public.zone_progress to authenticated;
grant select, insert, update, delete on public.work_notes to authenticated;

create policy "Users manage their work items" on public.work_items
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users manage their team" on public.team_members
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users manage their zone progress" on public.zone_progress
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users manage their notes" on public.work_notes
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-item-photos', 'work-item-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "Users upload their own work photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'work-item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users read their own work photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'work-item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users update their own work photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'work-item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'work-item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users delete their own work photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'work-item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
