export function buildLocalTeamFixtureCleanupSql(teamIds) {
  if (!Array.isArray(teamIds) || teamIds.some((id) =>
    typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  )) {
    throw new Error("Local fixture cleanup requires exact team UUIDs");
  }
  if (!teamIds.length) return null;
  const ids = [...new Set(teamIds)].map((id) => `'${id}'::uuid`).join(", ");
  // The existing owner guard permits this transaction-local flag. Restrict the
  // delete to this test run's created IDs, never all teams or existing fixtures.
  return `begin;
select set_config('app.transfer_team_ownership', 'on', true);
-- Sync tombstones reference the team. Remove children before its cascade.
delete from public.setlists where team_id = any(array[${ids}]);
delete from public.events where team_id = any(array[${ids}]);
delete from public.songs where team_id = any(array[${ids}]);
delete from public.teams where id = any(array[${ids}]);
commit;`;
}
