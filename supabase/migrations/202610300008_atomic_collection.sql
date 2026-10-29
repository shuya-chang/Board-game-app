begin;
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
commit;
