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
