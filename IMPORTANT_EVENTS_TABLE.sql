create extension if not exists pgcrypto;

create table if not exists public.important_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  event_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists important_events_user_id_idx
  on public.important_events (user_id);

create index if not exists important_events_user_date_idx
  on public.important_events (user_id, event_date);

alter table public.important_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'important_events'
      and policyname = 'important_events_select_own'
  ) then
    create policy "important_events_select_own"
      on public.important_events
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'important_events'
      and policyname = 'important_events_insert_own'
  ) then
    create policy "important_events_insert_own"
      on public.important_events
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'important_events'
      and policyname = 'important_events_update_own'
  ) then
    create policy "important_events_update_own"
      on public.important_events
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'important_events'
      and policyname = 'important_events_delete_own'
  ) then
    create policy "important_events_delete_own"
      on public.important_events
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;
