create extension if not exists pgcrypto;

create table if not exists public.gomoku_sessions (
  id uuid primary key default gen_random_uuid(),
  outcome text not null check (outcome in ('black_win', 'white_win', 'draw', 'abandoned')),
  winner text null check (winner in ('black', 'white') or winner is null),
  move_count integer not null check (move_count >= 0),
  board_size integer not null check (board_size >= 5),
  duration_ms integer not null check (duration_ms >= 0),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.gomoku_sessions enable row level security;

drop policy if exists "allow_anon_insert_gomoku_sessions" on public.gomoku_sessions;

create policy "allow_anon_insert_gomoku_sessions"
on public.gomoku_sessions
for insert
to anon
with check (true);

grant insert on table public.gomoku_sessions to anon;

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  details text null check (details is null or char_length(details) <= 400),
  due_date date null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists todos_owner_due_idx on public.todos (owner_id, due_date, created_at desc);

create or replace function public.set_todo_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_todos_updated_at on public.todos;

create trigger set_todos_updated_at
before update on public.todos
for each row
execute function public.set_todo_updated_at();

alter table public.todos enable row level security;
alter table public.todos force row level security;

drop policy if exists "todo_select_own" on public.todos;
drop policy if exists "todo_insert_own" on public.todos;
drop policy if exists "todo_update_own" on public.todos;
drop policy if exists "todo_delete_own" on public.todos;

create policy "todo_select_own"
on public.todos
for select
to authenticated
using (owner_id = auth.uid());

create policy "todo_insert_own"
on public.todos
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "todo_update_own"
on public.todos
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "todo_delete_own"
on public.todos
for delete
to authenticated
using (owner_id = auth.uid());

revoke all on table public.todos from anon;
grant select, insert, update, delete on table public.todos to authenticated;
