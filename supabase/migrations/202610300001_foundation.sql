-- Foundational schema. Application integration and lending RPCs are a separate migration.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (length(nickname) between 1 and 80),
  created_at timestamptz not null default now()
);
create table public.catalog_games (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  english_name text not null default '',
  description text not null default '',
  mechanisms text[] not null default '{}',
  categories text[] not null default '{}',
  bgg_id bigint unique,
  review_status text not null default 'unverified' check (review_status in ('verified','unverified')),
  created_at timestamptz not null default now(),
  check (length(trim(name)) > 0 or length(trim(english_name)) > 0)
);
create table public.private_notes (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  game_id uuid not null references public.catalog_games(id),
  body text not null default '' check (length(body) <= 10000),
  updated_at timestamptz not null default now(),
  primary key (user_id,game_id)
);
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) default auth.uid(),
  category text not null check (category in ('data','program','other')),
  game_id uuid references public.catalog_games(id),
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 5000),
  status text not null default 'pending' check (status in ('pending','processing','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create table public.catalog_audit (
  id bigint generated always as identity primary key,
  game_id uuid not null,
  before_data jsonb not null,
  after_data jsonb not null,
  actor text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.catalog_games enable row level security;
alter table public.private_notes enable row level security;
alter table public.feedback enable row level security;
alter table public.catalog_audit enable row level security;
revoke all on public.profiles,public.catalog_games,public.private_notes,public.feedback,public.catalog_audit from anon,authenticated;
grant select on public.catalog_games to authenticated;
grant select,insert,update on public.private_notes to authenticated;
grant select on public.profiles,public.feedback to authenticated;
create policy catalog_read on public.catalog_games for select to authenticated using (true);
create policy own_profile_read on public.profiles for select to authenticated using (id=auth.uid());
create policy own_note_read on public.private_notes for select to authenticated using (user_id=auth.uid());
create policy own_note_insert on public.private_notes for insert to authenticated with check (user_id=auth.uid());
create policy own_note_update on public.private_notes for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy own_feedback_read on public.feedback for select to authenticated using (reporter_id=auth.uid());
create function public.save_private_note(target_game uuid,note_body text) returns void
language sql security invoker set search_path='' as $$
  insert into public.private_notes(user_id,game_id,body,updated_at)
  values(auth.uid(),target_game,note_body,now())
  on conflict(user_id,game_id) do update set body=excluded.body,updated_at=excluded.updated_at;
$$;
revoke all on function public.save_private_note(uuid,text) from public,anon;
grant execute on function public.save_private_note(uuid,text) to authenticated;
create function public.audit_catalog_change() returns trigger language plpgsql security definer set search_path='' as $$
declare why text := current_setting('app.change_reason',true);
begin
  if why is null or length(trim(why))=0 then raise exception 'Catalog changes require app.change_reason'; end if;
  if (to_jsonb(new)-'review_status') is distinct from (to_jsonb(old)-'review_status') then new.review_status:='unverified'; end if;
  insert into public.catalog_audit(game_id,before_data,after_data,actor,reason)
  values(old.id,to_jsonb(old),to_jsonb(new),coalesce(auth.uid()::text,session_user),why);
  return new;
end; $$;
create trigger catalog_change_audit before update on public.catalog_games for each row execute function public.audit_catalog_change();
commit;
