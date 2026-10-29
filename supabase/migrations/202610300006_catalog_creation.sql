begin;
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
commit;
