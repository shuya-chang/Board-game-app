begin;
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
commit;
