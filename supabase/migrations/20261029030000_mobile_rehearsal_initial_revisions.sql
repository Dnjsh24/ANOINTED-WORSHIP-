-- Initial synchronization revisions are zero until the first record edit.
begin;
set local lock_timeout = '5s';
do $repair$
declare
  target oid := 'private.validate_mobile_rehearsal_command_core(jsonb,uuid,uuid)'::regprocedure;
  definition text;
  properties jsonb;
  old_bound constant text := 'not between 1 and 9007199254740991';
begin
  select pg_get_functiondef(p.oid),
    jsonb_build_object('owner',p.proowner,'grants',p.proacl,'securityDefiner',p.prosecdef,'settings',p.proconfig,'argumentNames',p.proargnames)
    into definition, properties from pg_proc p where p.oid = target;
  if (length(definition) - length(replace(definition,old_bound,''))) / length(old_bound) <> 3 then
    raise exception 'Expected exactly three rehearsal parent revision bounds';
  end if;
  execute replace(definition,old_bound,'not between 0 and 9007199254740991');
  if (select jsonb_build_object('owner',p.proowner,'grants',p.proacl,'securityDefiner',p.prosecdef,'settings',p.proconfig,'argumentNames',p.proargnames)
    from pg_proc p where p.oid = target) is distinct from properties then
    raise exception 'Rehearsal validator identity or security properties changed';
  end if;
end $repair$;
commit;
