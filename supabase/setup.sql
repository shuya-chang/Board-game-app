-- Only run once on the NEW board-game project. Do not run on another app project.
-- All changes are applied atomically. If any statement fails, no tables are committed.
begin;
-- 202610300001_foundation.sql
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

-- 202610300002_feedback.sql
-- Only the server may submit on behalf of the authenticated, verified user.
create function public.submit_feedback(reporter uuid,report_category text,report_title text,report_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare report_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(reporter::text,0));
  if (select count(*) from public.feedback where reporter_id=reporter and created_at>now()-interval '1 hour')>=10 then
    raise sqlstate 'PT429' using message='Too many reports';
  end if;
  insert into public.feedback(reporter_id,category,title,body) values(reporter,report_category,report_title,report_body) returning id into report_id;
  return report_id;
end; $$;
revoke all on function public.submit_feedback(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_feedback(uuid,text,text,text) to service_role;

-- 202610300003_lending.sql
create table public.game_groups (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 80),
 owner_id uuid not null references auth.users(id), is_public boolean not null default true, created_at timestamptz not null default now()
);
create table public.group_members (
 group_id uuid not null references public.game_groups(id), user_id uuid not null references auth.users(id),
 role text not null default 'member' check(role in ('owner','admin','member')), primary key(group_id,user_id)
);
create table public.collections (
 id uuid primary key default gen_random_uuid(), game_id uuid not null references public.catalog_games(id),
 owner_id uuid not null references auth.users(id) default auth.uid(),
 status text not null default 'owned' check(status in ('owned','wishlist','sold')),
 recommendation numeric check(recommendation between 0 and 10),
 actual_minutes integer check(actual_minutes>0), actual_basis text not null default 'whole' check(actual_basis in ('whole','person')),
 archived_at timestamptz, created_at timestamptz not null default now()
);
-- Private defaults never appear in the public collection table.
create table public.collection_terms (
 collection_id uuid primary key references public.collections(id), owner_id uuid not null references auth.users(id),
 deposit numeric(12,2) not null default 0 check(deposit>=0), fee numeric(12,2) not null default 0 check(fee>=0)
);
create table public.loans (
 id uuid primary key default gen_random_uuid(), collection_id uuid not null references public.collections(id),
 owner_id uuid not null references auth.users(id), borrower_id uuid references auth.users(id), external_name text,
 status text not null default 'pending' check(status in ('pending','needs_contact','handoff','received','returning','returned','declined','cancelled')),
 borrower_contact text not null default '' check(length(borrower_contact)<=1000), owner_contact text not null default '' check(length(owner_contact)<=1000),
 note text not null default '' check(length(note)<=5000), expected_return_date date, due_source text not null default 'default' check(due_source in ('default','custom')),
 deposit numeric(12,2) not null default 0 check(deposit>=0), fee numeric(12,2) not null default 0 check(fee>=0),
 snapshot jsonb, received_at timestamptz, returned_at timestamptz, revision integer not null default 1,
 created_at timestamptz not null default now(),
 check ((borrower_id is not null and external_name is null) or (borrower_id is null and length(trim(external_name))>0)),
 check (borrower_id is null or borrower_id<>owner_id)
);
create unique index one_active_loan_per_copy on public.loans(collection_id) where status in ('pending','needs_contact','handoff','received','returning');
create table public.loan_events (
 id bigint generated always as identity primary key, loan_id uuid not null references public.loans(id),
 actor_id uuid not null references auth.users(id), action text not null, from_status text, to_status text not null,
 created_at timestamptz not null default now()
);
create table public.loan_notice_dismissals (
 loan_id uuid not null references public.loans(id), user_id uuid not null references auth.users(id), revision integer not null,
 primary key(loan_id,user_id)
);
create function public.shares_group(other_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid()=other_user or exists(select 1 from public.group_members me join public.group_members them using(group_id) where me.user_id=auth.uid() and them.user_id=other_user);
$$;
create function public.can_view_collection(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.collections c where c.id=target and c.archived_at is null and
 (c.owner_id=auth.uid() or (c.status='owned' and (public.shares_group(c.owner_id) or exists(select 1 from public.loans l where l.collection_id=c.id and l.status in ('received','returning') and public.shares_group(l.borrower_id))))));
$$;
create function public.can_view_loan(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.loans l where l.id=target and auth.uid() in (l.owner_id,l.borrower_id));
$$;
alter table public.game_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.collections enable row level security;
alter table public.collection_terms enable row level security;
alter table public.loans enable row level security;
alter table public.loan_events enable row level security;
alter table public.loan_notice_dismissals enable row level security;
revoke all on public.game_groups,public.group_members,public.collections,public.collection_terms,public.loans,public.loan_events,public.loan_notice_dismissals from anon,authenticated;
grant select on public.game_groups,public.group_members,public.collections,public.collection_terms,public.loans,public.loan_events,public.loan_notice_dismissals to authenticated;
create policy group_read on public.game_groups for select to authenticated using(is_public or public.shares_group(owner_id));
create policy member_read on public.group_members for select to authenticated using(public.shares_group(user_id));
create policy collection_read on public.collections for select to authenticated using(public.can_view_collection(id));
create policy own_terms on public.collection_terms for select to authenticated using(owner_id=auth.uid());
create policy loan_parties on public.loans for select to authenticated using(auth.uid() in (owner_id,borrower_id));
create policy loan_event_parties on public.loan_events for select to authenticated using(public.can_view_loan(loan_id));
create policy own_dismissals on public.loan_notice_dismissals for select to authenticated using(user_id=auth.uid());

create function public.request_loan(target_collection uuid,contact text,due_date date default null,request_note text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.collections; new_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into c from public.collections where id=target_collection for update;
 if not found or c.owner_id=auth.uid() or c.status<>'owned' or c.archived_at is not null or not public.can_view_collection(c.id) then raise exception 'Copy unavailable'; end if;
 if length(trim(contact))=0 or length(contact)>1000 then raise exception 'Contact required'; end if;
 if due_date is not null and due_date<(now() at time zone 'Asia/Taipei')::date then raise exception 'Invalid return date'; end if;
 if exists(select 1 from public.loans where collection_id=c.id and status in ('pending','needs_contact','handoff','received','returning')) then raise exception 'Copy already requested or lent'; end if;
 insert into public.loans(collection_id,owner_id,borrower_id,borrower_contact,note,expected_return_date,due_source)
 values(c.id,c.owner_id,auth.uid(),contact,request_note,due_date,case when due_date is null then 'default' else 'custom' end) returning id into new_id;
 insert into public.loan_events(loan_id,actor_id,action,to_status) values(new_id,auth.uid(),'request','pending');
 return new_id;
end; $$;

create function public.act_on_loan(target_loan uuid,command text,contact text default '')
returns void language plpgsql security definer set search_path='' as $$
declare l public.loans; c public.collections; before_status text; next_status text; terms public.collection_terms;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into l from public.loans where id=target_loan;
 if not found or auth.uid() not in (l.owner_id,coalesce(l.borrower_id,l.owner_id)) then raise exception 'Not a participant'; end if;
 -- All state mutations lock the copy first, then the loan, in the same order.
 select * into c from public.collections where id=l.collection_id for update;
 select * into l from public.loans where id=target_loan for update;
 before_status:=l.status; next_status:=l.status;
 if command='accept' and auth.uid()=l.owner_id and l.status='pending' then
   if c.status<>'owned' or c.archived_at is not null then raise exception 'Copy unavailable'; end if;
   if length(trim(contact))=0 or length(contact)>1000 then raise exception 'Owner contact required'; end if;
   select * into terms from public.collection_terms where collection_id=c.id;
   l.owner_contact:=contact; l.deposit:=coalesce(terms.deposit,0); l.fee:=coalesce(terms.fee,0); next_status:='handoff';
 elsif command='needs_contact' and auth.uid()=l.owner_id and l.status='pending' then next_status:='needs_contact';
 elsif command='update_contact' and auth.uid()=l.borrower_id and l.status='needs_contact' then
   if length(trim(contact))=0 or length(contact)>1000 then raise exception 'Contact required'; end if;
   l.borrower_contact:=contact;next_status:='pending';
 elsif command='decline' and auth.uid()=l.owner_id and l.status in ('pending','needs_contact') then next_status:='declined';
 elsif command='receive' and auth.uid()=l.borrower_id and l.status='handoff' then
   next_status:='received';l.received_at:=now();
   if l.due_source='default' then l.expected_return_date:=(now() at time zone 'Asia/Taipei')::date+14; end if;
   l.snapshot:=jsonb_build_object('game',(select jsonb_build_object('name',name,'english_name',english_name) from public.catalog_games where id=c.game_id),
     'owner',(select nickname from public.profiles where id=l.owner_id),'borrower',(select nickname from public.profiles where id=l.borrower_id),
     'owner_contact',l.owner_contact,'borrower_contact',l.borrower_contact,'note',l.note,'deposit',l.deposit,'fee',l.fee,'expected_return_date',l.expected_return_date);
 elsif command='return' and auth.uid()=l.borrower_id and l.status='received' then next_status:='returning';
 elsif command='confirm_return' and auth.uid()=l.owner_id and (l.status='returning' or (l.borrower_id is null and l.status='received')) then
   next_status:='returned';l.returned_at:=now();
 elsif command='dismiss' then
   if l.status in ('pending','needs_contact','handoff') then next_status:='cancelled';
   elsif l.status='returning' then next_status:='received'; end if;
 else raise exception 'Invalid action or state'; end if;
 if next_status<>before_status then
   update public.loans set status=next_status,owner_contact=l.owner_contact,borrower_contact=l.borrower_contact,deposit=l.deposit,fee=l.fee,
    received_at=l.received_at,returned_at=l.returned_at,expected_return_date=l.expected_return_date,snapshot=l.snapshot,revision=revision+1 where id=l.id;
   insert into public.loan_events(loan_id,actor_id,action,from_status,to_status) values(l.id,auth.uid(),command,before_status,next_status);
 end if;
 if command='dismiss' then
   insert into public.loan_notice_dismissals(loan_id,user_id,revision) values(l.id,auth.uid(),(select revision from public.loans where id=l.id))
   on conflict(loan_id,user_id) do update set revision=excluded.revision;
 end if;
end; $$;

-- Limited, public custody projection: never returns prices or contact details.
create function public.custody_for(target_collection uuid)
returns table(holder_id uuid,owner_id uuid,stage text) language plpgsql stable security definer set search_path='' as $$
declare c public.collections; l public.loans;
begin
 if not public.can_view_collection(target_collection) then return; end if;
 select * into c from public.collections where id=target_collection;
 select * into l from public.loans where collection_id=c.id and status in ('handoff','received','returning');
 return query select case when l.status in ('received','returning') then l.borrower_id else c.owner_id end,c.owner_id,
 case l.status when 'handoff' then 'handoff' when 'received' then 'loaned' when 'returning' then 'returning' else 'available' end;
end; $$;
revoke all on function public.shares_group(uuid),public.can_view_collection(uuid),public.can_view_loan(uuid),public.request_loan(uuid,text,date,text),public.act_on_loan(uuid,text,text),public.custody_for(uuid) from public,anon;
grant execute on function public.shares_group(uuid),public.can_view_collection(uuid),public.can_view_loan(uuid),public.request_loan(uuid,text,date,text),public.act_on_loan(uuid,text,text),public.custody_for(uuid) to authenticated;

-- 202610300004_report_delivery.sql
create table public.report_delivery (
 report_id uuid primary key references public.feedback(id), delivered_at timestamptz,
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(), lease uuid
);
alter table public.report_delivery enable row level security;
revoke all on public.report_delivery from anon,authenticated;
create function public.queue_report() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.report_delivery(report_id) values(new.id);return new;end; $$;
create trigger feedback_delivery after insert on public.feedback for each row execute function public.queue_report();
create function public.claim_report_delivery() returns table(report_id uuid,title text,category text,lease uuid)
language sql security definer set search_path='' as $$
 with candidates as (select d.report_id from public.report_delivery d where d.delivered_at is null and d.next_attempt_at<=now() order by d.next_attempt_at limit 3 for update skip locked),
 claimed as (update public.report_delivery d set attempts=attempts+1,next_attempt_at=now()+interval '10 minutes',lease=gen_random_uuid() from candidates c where d.report_id=c.report_id returning d.report_id,d.lease)
 select c.report_id,f.title,f.category,c.lease from claimed c join public.feedback f on f.id=c.report_id;
$$;
create function public.finish_report_delivery(target_report uuid,lease_token uuid,success boolean) returns void
language sql security definer set search_path='' as $$
 update public.report_delivery set delivered_at=case when success then now() else null end,lease=null
 where report_id=target_report and lease=lease_token and delivered_at is null;
$$;
revoke all on function public.queue_report(),public.claim_report_delivery(),public.finish_report_delivery(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_report_delivery(),public.finish_report_delivery(uuid,uuid,boolean) to service_role;

-- 202610300005_personal_data.sql
alter table public.catalog_games add column min_players integer check(min_players>0);
alter table public.catalog_games add column max_players integer check(max_players>=min_players);
alter table public.catalog_games add column standard_minutes integer check(standard_minutes>0);
alter table public.catalog_games add column standard_basis text not null default 'whole' check(standard_basis in ('whole','person'));
alter table public.catalog_games add column bgg_difficulty numeric check(bgg_difficulty between 1 and 5);
alter table public.catalog_games add column bgg_recommendation numeric check(bgg_recommendation between 1 and 10);
alter table public.catalog_games add column bgg_ranks jsonb not null default '[]';
create table public.profile_private (
 user_id uuid primary key references auth.users(id) default auth.uid(), contact text not null default '' check(length(contact)<=1000),
 preferences jsonb not null default '{}'
);
alter table public.profile_private enable row level security;
revoke all on public.profile_private from anon,authenticated;
grant select,insert,update on public.profile_private to authenticated;
create policy profile_private_read on public.profile_private for select to authenticated using(user_id=auth.uid());
create policy profile_private_insert on public.profile_private for insert to authenticated with check(user_id=auth.uid());
create policy profile_private_update on public.profile_private for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create function public.initialize_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,nickname) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'新玩家'),80)) on conflict do nothing;
 return new;
end; $$;
create trigger new_auth_user after insert on auth.users for each row execute function public.initialize_profile();

create function public.add_collection(target_game uuid,collection_status text default 'owned',copy_id uuid default gen_random_uuid()) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.collections;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if collection_status not in ('owned','wishlist','sold') then raise exception 'Invalid collection status'; end if;
 select * into existing from public.collections where id=copy_id;
 if found then
   if existing.owner_id=auth.uid() and existing.game_id=target_game then return existing.id; end if;
   raise exception 'Copy identifier conflict';
 end if;
 insert into public.collections(id,game_id,owner_id,status) values(copy_id,target_game,auth.uid(),collection_status);
 return copy_id;
end; $$;
create function public.save_collection(target_copy uuid,collection_status text,owner_rating numeric,play_minutes integer,play_basis text default 'whole',archive boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare c public.collections;
begin
 select * into c from public.collections where id=target_copy for update;
 if not found or c.owner_id is distinct from auth.uid() then raise exception 'Not the owner'; end if;
 if (archive or collection_status<>c.status) and exists(select 1 from public.loans where collection_id=c.id and status in ('pending','needs_contact','handoff','received','returning')) then raise exception 'Active borrowing prevents removal or status change'; end if;
 update public.collections set status=collection_status,recommendation=owner_rating,actual_minutes=play_minutes,actual_basis=play_basis,
 archived_at=case when archive then now() else null end where id=c.id;
end; $$;
create function public.save_collection_terms(target_copy uuid,deposit_amount numeric,fee_amount numeric) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.collections where id=target_copy and owner_id=auth.uid() and status='owned' and archived_at is null) then raise exception 'Not the owner'; end if;
 insert into public.collection_terms(collection_id,owner_id,deposit,fee) values(target_copy,auth.uid(),deposit_amount,fee_amount)
 on conflict(collection_id) do update set deposit=excluded.deposit,fee=excluded.fee;
end; $$;
create function public.fill_description(target_game uuid,description_body text) returns void
language plpgsql security definer set search_path='' as $$
declare g public.catalog_games;
begin
 select * into g from public.catalog_games where id=target_game for update;
 if not found or length(trim(g.description))>0 or length(trim(description_body))=0 or length(description_body)>10000 then raise exception 'Description cannot be replaced'; end if;
 if not exists(select 1 from public.collections where game_id=g.id and owner_id=auth.uid() and status='owned' and archived_at is null) then raise exception 'An actual owner must fill the description'; end if;
 perform set_config('app.change_reason','擁有者補上空白簡介',true);
 update public.catalog_games set description=description_body where id=g.id;
end; $$;
revoke all on function public.initialize_profile(),public.add_collection(uuid,text,uuid),public.save_collection(uuid,text,numeric,integer,text,boolean),public.save_collection_terms(uuid,numeric,numeric),public.fill_description(uuid,text) from public,anon;
grant execute on function public.add_collection(uuid,text,uuid),public.save_collection(uuid,text,numeric,integer,text,boolean),public.save_collection_terms(uuid,numeric,numeric),public.fill_description(uuid,text) to authenticated;

-- 202610300006_catalog_creation.sql
create function public.create_catalog_game(game_data jsonb,collection_status text default 'owned') returns jsonb
language plpgsql security definer set search_path='' as $$
declare new_game uuid; new_copy uuid; body text:=coalesce(game_data->>'description','');
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if collection_status not in ('owned','wishlist','sold') then raise exception 'Invalid collection status'; end if;
 if length(coalesce(game_data->>'name',''))>80 or length(coalesce(game_data->>'english_name',''))>100 or length(body)>10000 then raise exception 'Input too long'; end if;
 if collection_status<>'owned' and length(trim(body))>0 then raise exception 'Only actual owners may write a shared description'; end if;
 insert into public.catalog_games(name,english_name,description,min_players,max_players,standard_minutes,standard_basis,mechanisms,categories)
 values(trim(coalesce(game_data->>'name','')),trim(coalesce(game_data->>'english_name','')),body,
 (game_data->>'min_players')::integer,(game_data->>'max_players')::integer,(game_data->>'standard_minutes')::integer,coalesce(game_data->>'standard_basis','whole'),
 array(select jsonb_array_elements_text(coalesce(game_data->'mechanisms','[]'))),array(select jsonb_array_elements_text(coalesce(game_data->'categories','[]')))) returning id into new_game;
 insert into public.collections(game_id,owner_id,status) values(new_game,auth.uid(),collection_status) returning id into new_copy;
 return jsonb_build_object('game_id',new_game,'collection_id',new_copy);
end; $$;
revoke all on function public.create_catalog_game(jsonb,text) from public,anon;
grant execute on function public.create_catalog_game(jsonb,text) to authenticated;

-- 202610300007_owner_lending.sql
alter table public.loans add column borrower_phone text not null default '' check(length(borrower_phone)<=100);
alter table public.loans add column borrower_mobile text not null default '' check(length(borrower_mobile)<=100);
create function public.lend_copy(target_copy uuid,member uuid,borrower_data jsonb,owner_contact_text text,due_date date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.collections; terms public.collection_terms; new_id uuid; state text; received timestamptz; due date; external text; snap jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into c from public.collections where id=target_copy for update;
 if not found or c.owner_id<>auth.uid() or c.status<>'owned' or c.archived_at is not null then raise exception 'Copy unavailable'; end if;
 if exists(select 1 from public.loans where collection_id=c.id and status in ('pending','needs_contact','handoff','received','returning')) then raise exception 'Copy already requested or lent'; end if;
 if length(trim(owner_contact_text))=0 or length(owner_contact_text)>1000 then raise exception 'Owner contact required'; end if;
 if due_date is not null and due_date<(now() at time zone 'Asia/Taipei')::date then raise exception 'Invalid return date'; end if;
 select * into terms from public.collection_terms where collection_id=c.id;
 if member is not null then
   if member=auth.uid() or not public.shares_group(member) then raise exception 'Select a group member'; end if;
   if length(trim(coalesce(borrower_data->>'contact','')))=0 then raise exception 'Borrower contact required'; end if;
   state:='handoff';
 else
   external:=trim(borrower_data->>'name');
   if external is null or length(external)=0 or length(external)>80 then raise exception 'Borrower name required'; end if;
   state:='received';received:=now();
 end if;
 due:=case when due_date is null and received is not null then (now() at time zone 'Asia/Taipei')::date+14 else due_date end;
 if received is not null then
   snap:=jsonb_build_object('game',(select jsonb_build_object('name',name,'english_name',english_name) from public.catalog_games where id=c.game_id),
   'owner',(select nickname from public.profiles where id=auth.uid()),'borrower',external,
   'owner_contact',owner_contact_text,'borrower_contact',coalesce(borrower_data->>'contact',''),
   'phone',coalesce(borrower_data->>'phone',''),'mobile',coalesce(borrower_data->>'mobile',''),'note',coalesce(borrower_data->>'note',''),
   'deposit',coalesce(terms.deposit,0),'fee',coalesce(terms.fee,0),'expected_return_date',due);
 end if;
 insert into public.loans(collection_id,owner_id,borrower_id,external_name,status,borrower_contact,owner_contact,borrower_phone,borrower_mobile,note,expected_return_date,due_source,deposit,fee,snapshot,received_at)
 values(c.id,auth.uid(),member,external,state,coalesce(borrower_data->>'contact',''),owner_contact_text,coalesce(borrower_data->>'phone',''),coalesce(borrower_data->>'mobile',''),coalesce(borrower_data->>'note',''),due,
 case when due_date is null then 'default' else 'custom' end,coalesce(terms.deposit,0),coalesce(terms.fee,0),snap,received) returning id into new_id;
 insert into public.loan_events(loan_id,actor_id,action,to_status) values(new_id,auth.uid(),'lend',state);
 return new_id;
end; $$;
revoke all on function public.lend_copy(uuid,uuid,jsonb,text,date) from public,anon;
grant execute on function public.lend_copy(uuid,uuid,jsonb,text,date) to authenticated;

commit;
