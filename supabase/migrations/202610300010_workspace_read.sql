begin;
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
