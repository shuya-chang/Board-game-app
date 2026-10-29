begin;
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
