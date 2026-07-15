-- scopy 사용자별 취업 데이터 저장소
-- Supabase Dashboard > SQL Editor에서 프로젝트 관리자가 실행합니다.

create table if not exists public.user_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_workspaces enable row level security;

drop policy if exists "users can read own workspace" on public.user_workspaces;
create policy "users can read own workspace"
on public.user_workspaces for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users can create own workspace" on public.user_workspaces;
create policy "users can create own workspace"
on public.user_workspaces for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own workspace" on public.user_workspaces;
create policy "users can update own workspace"
on public.user_workspaces for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users can delete own workspace" on public.user_workspaces;
create policy "users can delete own workspace"
on public.user_workspaces for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.set_workspace_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_workspaces_updated_at on public.user_workspaces;
create trigger set_user_workspaces_updated_at
before update on public.user_workspaces
for each row execute function public.set_workspace_updated_at();

grant select, insert, update, delete on public.user_workspaces to authenticated;
