begin;
-- Only the server may submit on behalf of the authenticated, verified user.
create function public.submit_feedback(reporter uuid,report_category text,report_title text,report_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare report_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(reporter::text,0));
  if (select count(*) from public.feedback where reporter_id=reporter and created_at>now()-interval '1 hour')>=10 then
    raise sqlstate 'PT429' using message='Too many reports';
  end if;
  insert into public.feedback(reporter_id,category,title,body) values(reporter,report_category,report_title,report_body) returning id into report_id;
  return report_id;
end; $$;
revoke all on function public.submit_feedback(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_feedback(uuid,text,text,text) to service_role;
commit;
