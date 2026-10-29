begin;
alter table public.game_groups add column description text not null default '' check(length(description)<=2000);
alter table public.game_groups add column tags text[] not null default '{}' check(cardinality(tags)<=20);
create unique index group_name_unique on public.game_groups(lower(trim(name)));
create table public.group_requests(id uuid primary key default gen_random_uuid(),group_id uuid not null references public.game_groups(id) on delete cascade,applicant uuid not null references auth.users(id),status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),revision integer not null default 1,created_at timestamptz not null default now());
create unique index one_pending_group_request on public.group_requests(group_id,applicant) where status='pending';
create table public.group_notices(id uuid primary key default gen_random_uuid(),group_id uuid references public.game_groups(id) on delete set null,group_name text not null,sender uuid not null references auth.users(id),sender_name text not null,title text not null check(length(title) between 1 and 100),body text not null check(length(body) between 1 and 2000),recipients uuid[] not null,recipient_names text[] not null,created_at timestamptz not null default now());
create table public.group_notice_reads(notice_id uuid references public.group_notices(id) on delete cascade,user_id uuid references auth.users(id),dismissed boolean not null default false,primary key(notice_id,user_id));
create table public.group_request_dismissals(request_id uuid references public.group_requests(id) on delete cascade,user_id uuid references auth.users(id),revision integer not null,primary key(request_id,user_id));
create table public.availability(user_id uuid primary key references auth.users(id),days jsonb not null default '{}',rules jsonb not null default '[]',revision integer not null default 1,updated_at timestamptz not null default now());
alter table public.group_requests enable row level security;alter table public.group_notices enable row level security;alter table public.group_notice_reads enable row level security;alter table public.group_request_dismissals enable row level security;alter table public.availability enable row level security;
revoke all on public.group_requests,public.group_notices,public.group_notice_reads,public.group_request_dismissals,public.availability from anon,authenticated;
grant select on public.group_requests,public.group_notices,public.group_notice_reads,public.group_request_dismissals,public.availability to authenticated;
drop policy group_read on public.game_groups;
create policy group_read on public.game_groups for select to authenticated using(true);
create policy group_request_read on public.group_requests for select to authenticated using(applicant=auth.uid() or exists(select 1 from public.game_groups where id=group_id and owner_id=auth.uid()));
create policy group_notice_read on public.group_notices for select to authenticated using(sender=auth.uid() or auth.uid()=any(recipients));
create policy group_receipt_read on public.group_notice_reads for select to authenticated using(user_id=auth.uid());
create policy group_dismissal_read on public.group_request_dismissals for select to authenticated using(user_id=auth.uid());
create policy availability_read on public.availability for select to authenticated using(public.shares_group(user_id));

create function public.group_command(command text,target_group uuid default null,values_json jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare g public.game_groups; role_text text; target_user uuid; successor uuid; request_row public.group_requests; new_id uuid; notice_row public.group_notices;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if command='create' then
   new_id:=coalesce((values_json->>'id')::uuid,gen_random_uuid());
   perform pg_advisory_xact_lock(hashtextextended(new_id::text,0));
   select * into g from public.game_groups where id=new_id;
   if found then if g.owner_id=auth.uid() then return new_id;else raise exception 'Identifier conflict';end if;end if;
   if length(trim(values_json->>'name')) not between 1 and 60 then raise exception 'Invalid group name';end if;
   insert into public.game_groups(id,name,owner_id,is_public,description,tags) values(new_id,trim(values_json->>'name'),auth.uid(),coalesce((values_json->>'open')::boolean,false),coalesce(values_json->>'description',''),array(select jsonb_array_elements_text(coalesce(values_json->'tags','[]'))));
   insert into public.group_members(group_id,user_id,role) values(new_id,auth.uid(),'owner');return new_id;
 end if;
 select * into g from public.game_groups where id=target_group for update;
 if not found then raise exception 'Group not found'; end if;
 select role into role_text from public.group_members where group_id=g.id and user_id=auth.uid();
 target_user:=(values_json->>'user_id')::uuid;
 if command='join' then
   if role_text is not null then return g.id;end if;
   if g.is_public then insert into public.group_members(group_id,user_id) values(g.id,auth.uid()) on conflict do nothing;
   else insert into public.group_requests(group_id,applicant) values(g.id,auth.uid()) on conflict(group_id,applicant) where status='pending' do nothing;end if;
 elsif command in ('cancel_request','review_request','dismiss_request') then
   select * into request_row from public.group_requests where id=(values_json->>'request_id')::uuid and group_id=g.id for update;
   if not found then raise exception 'Request not found';end if;
   if command='review_request' then
     if g.owner_id<>auth.uid() or request_row.status<>'pending' or values_json->>'status' not in ('accepted','declined') then raise exception 'Not allowed';end if;
     update public.group_requests set status=values_json->>'status',revision=revision+1 where id=request_row.id;
     if values_json->>'status'='accepted' then insert into public.group_members(group_id,user_id) values(g.id,request_row.applicant) on conflict do nothing;end if;
   else
     if request_row.applicant<>auth.uid() and (command='cancel_request' or g.owner_id<>auth.uid()) then raise exception 'Not allowed';end if;
     if request_row.status='pending' then update public.group_requests set status='cancelled',revision=revision+1 where id=request_row.id;end if;
     if command='dismiss_request' then insert into public.group_request_dismissals(request_id,user_id,revision) select id,auth.uid(),revision from public.group_requests where id=request_row.id on conflict(request_id,user_id) do update set revision=excluded.revision;end if;
   end if;
 elsif command='update' then
   if role_text is null or role_text not in ('owner','admin') then raise exception 'Not allowed';end if;
   if length(trim(values_json->>'name')) not between 1 and 60 then raise exception 'Invalid group name';end if;
   update public.game_groups set name=trim(values_json->>'name'),description=coalesce(values_json->>'description',''),is_public=coalesce((values_json->>'open')::boolean,false),tags=array(select jsonb_array_elements_text(coalesce(values_json->'tags','[]'))) where id=g.id;
 elsif command='admin' then
   if g.owner_id<>auth.uid() or target_user=g.owner_id then raise exception 'Not allowed';end if;
   update public.group_members set role=case when role='admin' then 'member' else 'admin' end where group_id=g.id and user_id=target_user;
 elsif command='transfer' then
   if g.owner_id<>auth.uid() or target_user is null or target_user=auth.uid() or not exists(select 1 from public.group_members where group_id=g.id and user_id=target_user) then raise exception 'Not allowed';end if;
   update public.group_members set role=case when user_id=target_user then 'owner' when user_id=auth.uid() then 'admin' else role end where group_id=g.id;
   update public.game_groups set owner_id=target_user where id=g.id;
 elsif command in ('leave','remove_member') then
   if command='leave' then target_user:=auth.uid();if role_text is null then raise exception 'Not a member';end if;
   elsif role_text is null or role_text not in ('owner','admin') or target_user=g.owner_id then raise exception 'Not allowed';end if;
   if target_user=g.owner_id then
     select user_id into successor from public.group_members where group_id=g.id and user_id<>target_user order by (role='admin') desc,user_id limit 1;
     if successor is not null then update public.game_groups set owner_id=successor where id=g.id;update public.group_members set role='owner' where group_id=g.id and user_id=successor;end if;
   end if;
   delete from public.group_members where group_id=g.id and user_id=target_user;
 elsif command='announce' then
   if role_text is null or role_text not in ('owner','admin') then raise exception 'Not allowed';end if;
   insert into public.group_notices(group_id,group_name,sender,sender_name,title,body,recipients,recipient_names)
   select g.id,g.name,auth.uid(),(select nickname from public.profiles where id=auth.uid()),trim(values_json->>'title'),trim(values_json->>'body'),array_agg(m.user_id order by m.user_id),array_agg(p.nickname order by m.user_id) from public.group_members m join public.profiles p on p.id=m.user_id where m.group_id=g.id returning id into new_id;
   insert into public.group_notice_reads(notice_id,user_id) values(new_id,auth.uid());return new_id;
 else raise exception 'Unknown command';end if;
 return g.id;
end; $$;
create function public.group_notice_action(target_notice uuid,remove_notice boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.group_notices where id=target_notice and (sender=auth.uid() or auth.uid()=any(recipients))) then raise exception 'Not allowed';end if;
 insert into public.group_notice_reads(notice_id,user_id,dismissed) values(target_notice,auth.uid(),remove_notice) on conflict(notice_id,user_id) do update set dismissed=public.group_notice_reads.dismissed or excluded.dismissed;
end; $$;

create function public.save_availability(days_json jsonb,rules_json jsonb,expected_revision integer) returns integer language plpgsql security definer set search_path='' as $$
declare current_revision integer; pair record; item record; rule jsonb; result integer;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if jsonb_typeof(days_json)<>'object' or jsonb_typeof(rules_json)<>'array' or length(days_json::text)>2000000 or jsonb_array_length(rules_json)>5000 then raise exception 'Invalid availability';end if;
 for pair in select * from jsonb_each(days_json) loop
   if pair.key !~ '^(week-[0-6]|[0-9]{4}-[0-9]{1,2}-[0-9]{1,2})$' or jsonb_typeof(pair.value)<>'object' then raise exception 'Invalid day';end if;
   for item in select * from jsonb_each(pair.value) loop
     if item.key !~ '^[0-9]{1,3}$' or item.key::integer>143 or item.value::text !~ '^[0-3]$' then raise exception 'Invalid slot';end if;
   end loop;
 end loop;
 for rule in select * from jsonb_array_elements(rules_json) loop
   if not (rule ?& array['weekday','start','end','state','startDate']) or (rule->>'weekday')::integer not between 0 and 6 or (rule->>'start')::integer not between 0 and 143 or (rule->>'end')::integer not between 1 and 144 or (rule->>'start')::integer>=(rule->>'end')::integer or (rule->>'state')::integer not between 0 and 3 or (rule->>'startDate')::date is null or ((rule->>'endDate') is not null and (rule->>'endDate')::date<(rule->>'startDate')::date) then raise exception 'Invalid repeat rule';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7));
 select revision into current_revision from public.availability where user_id=auth.uid() for update;
 if coalesce(current_revision,0)<>expected_revision then raise exception 'Availability changed on another device';end if;
 insert into public.availability(user_id,days,rules) values(auth.uid(),days_json,rules_json) on conflict(user_id) do update set days=excluded.days,rules=excluded.rules,revision=public.availability.revision+1,updated_at=now() returning revision into result;
 return result;
end; $$;
revoke all on function public.group_command(text,uuid,jsonb),public.group_notice_action(uuid,boolean),public.save_availability(jsonb,jsonb,integer) from public,anon;
grant execute on function public.group_command(text,uuid,jsonb),public.group_notice_action(uuid,boolean),public.save_availability(jsonb,jsonb,integer) to authenticated;
commit;
