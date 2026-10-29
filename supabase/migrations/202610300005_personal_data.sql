begin;
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
commit;
