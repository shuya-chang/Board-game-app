-- Board Game Tool: incremental cloud collection/profile update.
-- Run once in the existing project. No existing collection or loan is deleted.
begin;
-- 202610300008_atomic_collection.sql
-- One transaction covers the shared game, personal collection, private terms
-- and private note. A client-generated copy key makes network retries safe.
create function public.save_my_collection(copy_key uuid,catalog_key uuid,common_data jsonb,personal_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.collections; gid uuid; created jsonb;
  wanted_status text:=personal_data->>'status';
begin
 if auth.uid() is null or copy_key is null then raise exception 'Sign in required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(copy_key::text,0));
 select * into c from public.collections where id=copy_key for update;
 if found then
   if c.owner_id is distinct from auth.uid() then raise exception 'Not the owner'; end if;
   if catalog_key is not null and catalog_key<>c.game_id then raise exception 'Game identity cannot change'; end if;
   gid:=c.game_id;
 else
   if catalog_key is null then
     created:=public.create_catalog_game(common_data,wanted_status);
     gid:=(created->>'game_id')::uuid;
     update public.collections set id=copy_key where id=(created->>'collection_id')::uuid;
   else
     if not exists(select 1 from public.catalog_games where id=catalog_key) then raise exception 'Game not found'; end if;
     gid:=catalog_key;
     perform public.add_collection(gid,wanted_status,copy_key);
   end if;
 end if;
 perform public.save_collection(copy_key,wanted_status,(personal_data->>'recommendation')::numeric,
   (personal_data->>'actual_minutes')::integer,coalesce(personal_data->>'actual_basis','whole'),false);
 if wanted_status='owned' then
   perform public.save_collection_terms(copy_key,coalesce((personal_data->>'deposit')::numeric,0),coalesce((personal_data->>'fee')::numeric,0));
 end if;
 perform public.save_private_note(gid,coalesce(personal_data->>'note',''));
 return jsonb_build_object('collection_id',copy_key,'game_id',gid);
end; $$;
revoke all on function public.save_my_collection(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_my_collection(uuid,uuid,jsonb,jsonb) to authenticated;

-- 202610300009_profile_media.sql
alter table public.profiles add column avatar_path text not null default '';
alter table public.profiles add column avatar_mode text not null default 'google' check(avatar_mode in ('google','custom','none'));
alter table public.catalog_games add column image_owner uuid references auth.users(id) default auth.uid();
alter table public.catalog_games add column image_source text not null default 'pending' check(image_source in ('pending','not_found','manual','bgg'));
alter table public.catalog_games add column image_paths text[] not null default '{}' check(cardinality(image_paths)<=3);
alter table public.catalog_games add column bgg_image_urls text[] not null default '{}' check(cardinality(bgg_image_urls)<=3);

create function public.my_profile() returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles; secret public.profile_private; metadata jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select raw_user_meta_data into metadata from auth.users where id=auth.uid();
 insert into public.profiles(id,nickname) values(auth.uid(),left(coalesce(nullif(trim(metadata->>'name'),''),'新玩家'),80)) on conflict do nothing;
 select * into p from public.profiles where id=auth.uid();
 select * into secret from public.profile_private where user_id=auth.uid();
 return jsonb_build_object('nickname',p.nickname,'avatar_mode',p.avatar_mode,'avatar_path',p.avatar_path,
   'google_avatar',case when metadata->>'avatar_url' like 'https://%' then metadata->>'avatar_url' else '' end,
   'contact',coalesce(secret.contact,''),'preferences',coalesce(secret.preferences,'{}'));
end; $$;
create function public.save_my_profile(display_name text,photo_mode text,photo_path text,contact_text text,settings jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if length(trim(display_name)) not between 1 and 24 or length(contact_text)>1000 or length(settings::text)>10000 then raise exception 'Invalid profile'; end if;
 if photo_mode not in ('google','custom','none') or (photo_mode='custom' and (photo_path not like auth.uid()::text||'/avatars/%' or length(photo_path)>300)) then raise exception 'Invalid avatar'; end if;
 update public.profiles set nickname=trim(display_name),avatar_mode=photo_mode,avatar_path=case when photo_mode='custom' then photo_path else '' end where id=auth.uid();
 insert into public.profile_private(user_id,contact,preferences) values(auth.uid(),contact_text,settings)
 on conflict(user_id) do update set contact=excluded.contact,preferences=excluded.preferences;
end; $$;
create function public.set_manual_game_images(target_game uuid,paths text[]) returns void
language plpgsql security definer set search_path='' as $$
declare g public.catalog_games;
begin
 select * into g from public.catalog_games where id=target_game for update;
 if not found or auth.uid() is null or g.image_owner is distinct from auth.uid() then raise exception 'Only the first creator may set images'; end if;
 if g.image_source<>'not_found' or cardinality(g.image_paths)>0 then raise exception 'Images are locked'; end if;
 if cardinality(paths) not between 1 and 3 or paths is null or exists(select 1 from unnest(paths) p where p is null or p not like auth.uid()::text||'/catalog/'||target_game::text||'/%' or length(p)>300) then raise exception 'Invalid image path'; end if;
 perform set_config('app.change_reason','首位建立者設定 BGG 查無資料的桌遊圖片',true);
 update public.catalog_games set image_paths=paths,image_source='manual' where id=target_game;
end; $$;
create function public.can_read_media(object_name text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare owner_key uuid; copy_key uuid;
begin
 if auth.uid() is null then return false; end if;
 begin owner_key:=split_part(object_name,'/',1)::uuid; exception when invalid_text_representation then return false; end;
 if owner_key=auth.uid() then return true; end if;
 if split_part(object_name,'/',2)='avatars' then return public.shares_group(owner_key); end if;
 if split_part(object_name,'/',2)='catalog' then
   begin copy_key:=split_part(object_name,'/',3)::uuid; exception when invalid_text_representation then return false; end;
   return exists(select 1 from public.catalog_games where id=copy_key and image_owner=owner_key and object_name=any(image_paths));
 end if;
 return false;
end; $$;
-- Supabase Storage is not present in the local PostgreSQL test harness.
do $$ begin
 if to_regclass('storage.buckets') is not null then
   insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('boardgame-media','boardgame-media',false,2097152,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
   execute 'create policy boardgame_media_read on storage.objects for select to authenticated using(bucket_id=''boardgame-media'' and public.can_read_media(name))';
   execute 'create policy boardgame_media_insert on storage.objects for insert to authenticated with check(bucket_id=''boardgame-media'' and split_part(name,''/'',1)=auth.uid()::text and split_part(name,''/'',2) in (''avatars'',''catalog''))';
   execute 'create policy boardgame_media_delete on storage.objects for delete to authenticated using(bucket_id=''boardgame-media'' and split_part(name,''/'',1)=auth.uid()::text and not exists(select 1 from public.catalog_games g where storage.objects.name=any(g.image_paths)))';
 end if;
end $$;
revoke all on function public.my_profile(),public.save_my_profile(text,text,text,text,jsonb),public.set_manual_game_images(uuid,text[]),public.can_read_media(text) from public,anon;
grant execute on function public.my_profile(),public.save_my_profile(text,text,text,text,jsonb),public.set_manual_game_images(uuid,text[]),public.can_read_media(text) to authenticated;

-- 202610300010_workspace_read.sql
-- Read the public holder projection without disclosing a loan's contacts or fees.
create function public.workspace_people() returns table(id uuid,nickname text,avatar_path text,google_avatar text)
language sql stable security definer set search_path='' as $$
 select p.id,p.nickname,case when p.avatar_mode='custom' then p.avatar_path else '' end,
 case when p.avatar_mode='google' and u.raw_user_meta_data->>'avatar_url' like 'https://%' then u.raw_user_meta_data->>'avatar_url' else '' end
 from public.profiles p join auth.users u on u.id=p.id
 where auth.uid() is not null and (public.shares_group(p.id) or exists(select 1 from public.loans l where (l.owner_id=auth.uid() and l.borrower_id=p.id) or (l.borrower_id=auth.uid() and l.owner_id=p.id)));
$$;
create function public.workspace_custody() returns table(collection_id uuid,holder_id uuid,owner_id uuid,stage text)
language sql stable security definer set search_path='' as $$
 select c.id,v.holder_id,v.owner_id,v.stage from public.collections c cross join lateral public.custody_for(c.id) v
 where c.archived_at is null and public.can_view_collection(c.id);
$$;
create function public.is_group_member(target_group uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.group_members where group_id=target_group and user_id=auth.uid());
$$;
drop policy if exists member_read on public.group_members;
create policy member_read on public.group_members for select to authenticated using(public.is_group_member(group_id));

-- Parent locking also serializes concurrent removals of different members.
create function public.lock_membership_group() returns trigger language plpgsql security definer set search_path='' as $$
begin perform 1 from public.game_groups where id=old.group_id for update;return old;end; $$;
create function public.cleanup_empty_group() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from public.game_groups where id=old.group_id and not exists(select 1 from public.group_members where group_id=old.group_id);return old;end; $$;
create trigger lock_group_before_member_delete before delete on public.group_members for each row execute function public.lock_membership_group();
create trigger remove_empty_group after delete on public.group_members for each row execute function public.cleanup_empty_group();
revoke all on function public.workspace_people(),public.workspace_custody(),public.is_group_member(uuid),public.lock_membership_group(),public.cleanup_empty_group() from public,anon;
grant execute on function public.workspace_people(),public.workspace_custody(),public.is_group_member(uuid) to authenticated;
commit;
