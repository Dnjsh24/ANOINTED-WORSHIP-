// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEventDetail, readEventLibrary } from "./read-events";
import { verifiedServiceResponseVersion } from './service-response-state';

import { fixture, server, identity, id, timestamp, type Row } from "./event-read-test-fixture";

describe("authenticated complete event read graph", () => {
  it("uses explicit bearer verification and injected fetch, reads all pages despite a smaller server cap, and assembles detail children", async () => {
    const { client, urls, authHeaders } = server(fixture(), { cap: 1 });
    const rows = await readEventLibrary({ client, identity, accessToken: "verified-token", pageSize: 2 });
    expect(authHeaders).toEqual(["Bearer verified-token", "Bearer verified-token"]);
    expect(rows.map(row => row.id)).toEqual([id(10), id(11), id(12), id(13)]);
    expect(rows[0]).toMatchObject({ myStatus: "available", confirmed: 1, createdByMe: true, setlistIds: [id(40)], permissions: { canManage: true, canReview: true }, servicePlanning: { order: { revision: 2 }, responses: [{ note: "Ready" }], templates: [{ name: "Sunday" }] }, orderSongs: [{ id: id(60), title: "Holy" }] });
    expect(rows[2].servicePlanning).toBeNull();
    expect(urls.filter(url => url.pathname.endsWith("/events")).some(url => url.searchParams.get("id") === `gt.${id(13)}`)).toBe(true);
    expect(urls.filter(url => url.pathname.startsWith("/rest/")).every(url => !url.searchParams.has("offset") && !url.searchParams.get("select")?.includes("*"))).toBe(true);
  });
  it("distinguishes missing membership, account mismatch, and service outages without returning partial/demo content", async () => {
    const wrong = server(fixture(), { userId: id(99) });
    await expect(readEventLibrary({ client: wrong.client, identity })).rejects.toMatchObject({ status: 401 });
    expect(wrong.urls).toHaveLength(1);
    const missing = fixture(); missing.team_members = [];
    const noMember = server(missing);
    await expect(readEventLibrary({ client: noMember.client, identity })).rejects.toMatchObject({ status: 403 });
    expect(noMember.urls.some(url => url.pathname.endsWith("/events"))).toBe(false);
    const outage = server(fixture(), { failTable: "service_orders" });
    await expect(readEventLibrary({ client: outage.client, identity })).rejects.toMatchObject({ status: 503 });
  });
  it("rejects cross-team parents, private foreign drafts, and wrong child parents returned by a faulty transport", async () => {
    for (const [table, change] of [
      ["events", { team_id: id(90) }],
      ["events", { approval_status: "pending", created_by: id(90) }],
      ["attendance", { event_id: id(90) }],
      ["assignment_responses", { team_member_id: id(90) }],
    ] as const) {
      const data = fixture();
      if (table === "events") data.events = [data.events[0]];
      const { client } = server(data, { role: "member", mutate: (name, rows) => name === table ? rows.map(row => ({ ...row, ...change })) : rows });
      await expect(readEventLibrary({ client, identity })).rejects.toMatchObject({ status: table === "events" ? 403 : 503 });
    }
  });
  it("loads one accessible detail, retains hidden-profile fallback, and reports inaccessible IDs as absent", async () => {
    const { client } = server();
    expect(await readEventDetail({ client, identity, eventId: id(10), pageSize: 1 })).toMatchObject({ id: id(10), roster: [{ fullName: "Unknown" }] });
    expect(await readEventDetail({ client, identity, eventId: id(99) })).toBeNull();
    const deleted = fixture(); deleted.events[0].deleted_at = timestamp;
    expect(await readEventDetail({ client: server(deleted).client, identity, eventId: id(10) })).toMatchObject({ record: { deleted_at: timestamp } });
  });
  it("bounds all parent IN lists independently of the requested page size", async () => {
    const data = fixture();
    data.events = Array.from({ length: 61 }, (_, index) => ({ ...data.events[0], id: id(100 + index) }));
    const { client, urls } = server(data);
    expect(await readEventLibrary({ client, identity, pageSize: 500 })).toHaveLength(61);
    const batches = urls.flatMap(url => [...url.searchParams.values()].filter(value => value.startsWith("in.(")).map(value => value.slice(4, -1).split(",")));
    expect(batches.some(batch => batch.length === 50)).toBe(true);
    expect(batches.every(batch => batch.length <= 50)).toBe(true);
  });
  it("resolves effective management overrides while keeping owner/admin event-review authority separate", async () => {
    const data = fixture(); data.events = [data.events[0]];
    data.team_permission_overrides = [{ id: id(80), team_id: identity.teamId, role: "member", member_id: null, permission: "events.manage", allowed: true }];
    const { client } = server(data, { role: "member" });
    expect((await readEventLibrary({ client, identity }))[0].permissions).toMatchObject({ canManage: true, canReview: false });
    data.team_permission_overrides[0] = { ...data.team_permission_overrides[0], role: "admin", allowed: false };
    const denied = server(data, { role: "admin" });
    expect((await readEventLibrary({ client: denied.client, identity }))[0].permissions).toMatchObject({ canManage: false, canReview: true });
    const outage = server(data, { role: "admin", failTable: "team_permission_overrides" });
    await expect(readEventLibrary({ client: outage.client, identity })).rejects.toMatchObject({ status: 503 });
    expect(outage.urls.some(url => url.pathname.endsWith("/events"))).toBe(false);
  });
  it("fails closed on changed membership and malformed/unordered response pages", async () => {
    const changed = server(fixture(), { mutate: (table, rows, calls) => table === "team_members" && calls > 1 ? rows.map(row => ({ ...row, role: "admin" })) : rows });
    await expect(readEventLibrary({ client: changed.client, identity })).rejects.toMatchObject({ status: 403 });
    const invalid = fixture(); invalid.events[0].event_date = "2026-02-30";
    await expect(readEventLibrary({ client: server(invalid).client, identity })).rejects.toMatchObject({ status: 503 });
    const repeated = server(fixture(), { mutate: (table, rows) => table === "events" && rows.length ? [rows[0], rows[0]] : rows });
    await expect(readEventLibrary({ client: repeated.client, identity, pageSize: 2 })).rejects.toThrow("pagination");
  });
  it("aborts before network work and propagates cancellation during a read", async () => {
    const controller = new AbortController(); controller.abort();
    const initial = server();
    await expect(readEventLibrary({ client: initial.client, identity, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(initial.urls).toEqual([]);
    const later = new AbortController();
    const running = server(fixture(), { onRequest: url => { if (url.pathname.endsWith("/events")) later.abort(); } });
    await expect(readEventLibrary({ client: running.client, identity, signal: later.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("retains exact own attendance and tombstone bases, while never-observed events have no revision", async () => {
    const data = fixture();
    data.mobile_workflow_attendance_state.push({ ...data.mobile_workflow_attendance_state[0], event_id: id(11), attendance_id: id(31), revision: 3, deleted: true });
    const { client, urls } = server(data, { cap: 1 });
    const verified: unknown[] = [];
    const rows = await readEventLibrary({ client, identity, pageSize: 2, onVerified: authorization => { verified.push(authorization); } });
    expect(rows[0]).toMatchObject({ attendance: [{ id: id(30), sync_revision: 1, status: "available", note: null }], ownAttendanceState: { actorId: identity.userId, teamId: identity.teamId, eventId: id(10), memberId: identity.memberId, attendanceId: id(30), revision: 1, deleted: false, changedAt: timestamp } });
    expect(rows[1]).toMatchObject({ myStatus: "no_response", attendance: [], ownAttendanceState: { eventId: id(11), attendanceId: id(31), revision: 3, deleted: true } });
    expect(rows[2].ownAttendanceState).toBeNull();
    expect(verified).toHaveLength(2);
    expect(verified[0]).toEqual(verified[1]);
    expect(verified[0]).toMatchObject({ ...identity, role: "owner", permissions: expect.arrayContaining(["attendance.confirm", "songs.edit"]) });
    const requests = urls.filter(url => url.pathname.endsWith("/mobile_workflow_attendance_state"));
    expect(requests.length).toBeGreaterThan(2);
    for (const url of requests) {
      expect(url.searchParams.get("actor_id")).toBe("eq." + identity.userId);
      expect(url.searchParams.get("team_id")).toBe("eq." + identity.teamId);
      expect(url.searchParams.get("member_id")).toBe("eq." + identity.memberId);
      expect(url.searchParams.get("event_id")).toMatch(/^in\.\(/);
      expect(url.searchParams.get("order")).toBe("event_id.asc");
    }
    expect(requests.some(url => url.searchParams.getAll("event_id").includes("gt." + id(10)))).toBe(true);
  });
  it("keeps a later website upsert or recreated RSVP's exact status, note, ID, and revision", async () => {
    const data = fixture();
    data.attendance[0] = { ...data.attendance[0], id: id(32), status: "maybe", note: "Waiting for transport", sync_revision: 7 };
    data.mobile_workflow_attendance_state[0] = { ...data.mobile_workflow_attendance_state[0], attendance_id: id(32), revision: 7 };
    const row = await readEventDetail({ client: server(data).client, identity, eventId: id(10) });
    expect(row).toMatchObject({ myStatus: "maybe", attendance: [{ id: id(32), status: "maybe", note: "Waiting for transport", sync_revision: 7 }], ownAttendanceState: { attendanceId: id(32), revision: 7, deleted: false } });
  });
  it("isolates the actor's state and rejects incorrectly scoped state even after transport filtering", async () => {
    const data = fixture();
    for (const change of [{ actor_id: id(90) }, { team_id: id(90) }, { member_id: id(90) }]) {
      data.mobile_workflow_attendance_state.push({ ...data.mobile_workflow_attendance_state[0], ...change, revision: 99 });
    }
    expect((await readEventLibrary({ client: server(data).client, identity }))[0].ownAttendanceState?.revision).toBe(1);
    for (const change of [{ actor_id: id(90) }, { team_id: id(90) }, { member_id: id(90) }, { event_id: id(90) }]) {
      const { client } = server(fixture(), { mutate: (table, rows) => table === "mobile_workflow_attendance_state" ? rows.map(row => ({ ...row, ...change })) : rows });
      await expect(readEventLibrary({ client, identity })).rejects.toMatchObject({ status: 503, category: "unavailable" });
    }
  });
  it("refuses mixed RSVP/state reads and missing draft schema without inventing an offline base", async () => {
    const cases: ((data: Record<string, Row[]>) => void)[] = [
      data => { data.mobile_workflow_attendance_state[0].revision = 2; },
      data => { data.mobile_workflow_attendance_state[0].attendance_id = id(99); },
      data => { data.mobile_workflow_attendance_state[0].deleted = true; },
      data => { data.mobile_workflow_attendance_state = []; },
      data => { data.attendance = []; },
      data => { data.attendance.push({ ...data.attendance[0], id: id(31) }); },
      data => { data.attendance[0].sync_revision = 0; },
      data => { delete data.attendance[0].sync_revision; },
      data => { data.mobile_workflow_attendance_state[0].revision = 0; },
      data => { data.mobile_workflow_attendance_state[0].changed_at = "bad"; },
    ];
    for (const change of cases) {
      const data = fixture(); change(data);
      await expect(readEventLibrary({ client: server(data).client, identity })).rejects.toMatchObject({ status: 503, category: "unavailable" });
    }
    const unavailable = server(fixture(), { failTable: "mobile_workflow_attendance_state" });
    await expect(readEventLibrary({ client: unavailable.client, identity })).rejects.toMatchObject({ status: 503 });
    const race = fixture(); race.mobile_workflow_attendance_state[0].revision = 2;
    await expect(readEventLibrary({ client: server(race).client, identity })).rejects.toThrow("Attendance changed during this read");
  });

  it('downloads all own service response versions/tombstones with explicit scope filters', async () => {
    const data = fixture();
    data.mobile_service_assignment_state.push({ ...data.mobile_service_assignment_state[0], assignment_id: id(21), revision: 3, deleted: true });
    data.event_assignments.push({ ...data.event_assignments[0], id: id(22), assignment: 'Camera' });
    const source = server(data, { cap: 1 }); const events = await readEventLibrary({ client: source.client, identity, pageSize: 2 });
    expect(events[0].servicePlanning?.ownResponseStates).toHaveLength(2);
    expect(verifiedServiceResponseVersion(events[0], identity, id(20))).toMatchObject({ revision: 1, deleted: false });
    expect(verifiedServiceResponseVersion(events[0], identity, id(22))).toMatchObject({ revision: 0, deleted: true });
    const requests = source.urls.filter(url => url.pathname.endsWith('/mobile_service_assignment_state'));
    expect(requests.length).toBeGreaterThan(2);
    expect(requests.every(url => url.searchParams.get('actor_id') === `eq.${identity.userId}` && url.searchParams.get('team_id') === `eq.${identity.teamId}`
      && url.searchParams.get('member_id') === `eq.${identity.memberId}` && !url.searchParams.has('offset'))).toBe(true);
    expect(events[2].servicePlanning).toBeNull();
  });
  it('rejects mixed or unavailable service versions without publishing a partial read', async () => {
    const cases: ((data: Record<string, Row[]>) => void)[] = [
      data => { data.mobile_service_assignment_state[0].revision = 2; },
      data => { data.mobile_service_assignment_state[0].deleted = true; },
      data => { data.mobile_service_assignment_state = []; },
      data => { data.assignment_responses = []; },
      data => { delete data.assignment_responses[0].sync_revision; },
      data => { data.mobile_service_assignment_state[0].changed_at = 'bad'; },
    ];
    for (const change of cases) {
      const data = fixture(); change(data); await expect(readEventLibrary({ client: server(data).client, identity })).rejects.toMatchObject({ status: 503 });
    }
    await expect(readEventLibrary({ client: server(fixture(), { failTable: 'mobile_service_assignment_state' }).client, identity })).rejects.toMatchObject({ status: 503 });
    for (const change of [{ actor_id: id(99) }, { team_id: id(99) }, { member_id: id(99) }, { event_id: id(99) }]) {
      const source = server(fixture(), { mutate: (table, rows) => table === 'mobile_service_assignment_state' ? rows.map(row => ({ ...row, ...change })) : rows });
      await expect(readEventLibrary({ client: source.client, identity })).rejects.toMatchObject({ status: 503 });
    }
  });
  it('finds a current own assignment tombstone under its former event, even when the former event is absent', async () => {
    const data = fixture(); data.events = [data.events[0]]; data.assignment_responses = [];
    data.mobile_service_assignment_state[0] = { ...data.mobile_service_assignment_state[0], event_id: id(99), revision: 4, deleted: true };
    const source = server(data, { cap: 1 }); const row = await readEventDetail({ client: source.client, identity, eventId: id(10), pageSize: 1 });
    expect(verifiedServiceResponseVersion(row!, identity, id(20))).toMatchObject({ revision: 4, deleted: true });
    expect(row!.servicePlanning!.ownResponseStates![0].event_id).toBe(id(99));
    expect(source.urls.some(url => url.pathname.endsWith('/mobile_service_assignment_state') && url.searchParams.has('assignment_id'))).toBe(true);
    data.mobile_service_assignment_state[0].deleted = false;
    await expect(readEventDetail({ client: server(data).client, identity, eventId: id(10) })).rejects.toMatchObject({ status: 503 });
  });
  it('rejects a state that changes between event and assignment reads without publishing either version', async () => {
    let byAssignment = false;
    const source = server(fixture(), { onRequest: url => { if (url.pathname.endsWith('/mobile_service_assignment_state')) byAssignment = url.searchParams.has('assignment_id'); },
      mutate: (table, rows) => table === 'mobile_service_assignment_state' && byAssignment ? rows.map(row => ({ ...row, revision: 2 })) : rows });
    await expect(readEventLibrary({ client: source.client, identity })).rejects.toThrow(/changed between pages/);
  });
  it("rejects malformed scope or unsafe page sizes before auth/network", async () => {
    const { client, urls } = server();
    await expect(readEventLibrary({ client, identity, pageSize: 501 })).rejects.toThrow("page size");
    await expect(readEventLibrary({ client, identity: { ...identity, teamId: "malformed" } })).rejects.toThrow("identity");
    expect(urls).toEqual([]);
  });
});
