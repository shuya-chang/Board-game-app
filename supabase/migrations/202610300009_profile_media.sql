begin;
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
commit;
