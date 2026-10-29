begin;
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
commit;
