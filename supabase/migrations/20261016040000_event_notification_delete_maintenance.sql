-- DRAFT, separate compatibility scope. No hosted application.
-- Preserve all shared notice/receipt guards. Only the existing FK's parent-gone
-- maintenance update is admitted, not a client-controlled setting or depth alone.
-- Forward recovery: fix this predicate in a later migration, never disable guards.
begin;
create or replace function private.guard_shared_notice_choreography() returns trigger language plpgsql security definer set search_path='' as $$
declare v_type text;
begin
 -- FK ON DELETE SET NULL maintenance only: nested trigger, vanished exact
 -- parent, one non-null -> null link, and every other field/receipt unchanged.
 -- A direct UPDATE or a link to any existing event cannot enter this branch.
 if tg_table_name='notifications' and tg_op='UPDATE' and pg_trigger_depth()>1
  and old.event_id is not null and new.event_id is null
  and not exists(select 1 from public.events where id=old.event_id)
  and (to_jsonb(new)-array['event_id','shared_edit_revision'])=(to_jsonb(old)-array['event_id','shared_edit_revision']) then
  return new;
 end if;
 v_type:=case tg_table_name when 'dance_notes' then 'choreography' else 'reminder' end;
 if tg_table_name='notifications' and (to_jsonb(new)-array['read_at','acknowledged_at','shared_edit_revision'])=(to_jsonb(old)-array['read_at','acknowledged_at','shared_edit_revision']) then
  if auth.uid() is not null and (old.profile_id<>auth.uid() or not private.is_approved_member(old.team_id)) then raise exception 'Only the recipient can update a personal receipt' using errcode='42501'; end if;
  return new;
 end if;
 if auth.uid() is not null and not private.can_review_shared_edit(old.team_id,v_type) then raise exception 'Shared changes require the responsible reviewer' using errcode='42501'; end if;
 if new.team_id<>old.team_id or new.id<>old.id or new.created_by is distinct from old.created_by then raise exception 'Shared identity cannot change' using errcode='42501'; end if;
 if tg_table_name='notifications' and (to_jsonb(new)-array['title','body','priority','shared_edit_revision']) is distinct from (to_jsonb(old)-array['title','body','priority','shared_edit_revision']) then raise exception 'Reminder recipients, schedule and personal receipts cannot change with shared content' using errcode='42501'; end if;
 if tg_table_name='dance_notes' and (to_jsonb(new)->'song_id' is distinct from to_jsonb(old)->'song_id' or to_jsonb(new)->'event_id' is distinct from to_jsonb(old)->'event_id') then raise exception 'Choreography links cannot change' using errcode='42501'; end if;
 return new;
end;
$$;
commit;
