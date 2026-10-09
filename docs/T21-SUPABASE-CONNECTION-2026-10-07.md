# Supabase connection repair — 2026-10-07

The coordinator can now inspect and edit the confirmed worship project `xvrndwkghxkqsvxxtqym`. The official native Supabase MCP connection authenticated successfully and passed live read and write-permission checks.

## Configuration and authorization

The user explicitly requested repairing the connection so the coordinator can edit Supabase. The installed hosted plugin was enabled but its calls returned MCP `Unknown tool`; the active Codex account had no native Supabase server. A private account configuration backup was preserved before using the installed CLI:

```powershell
codex mcp add supabase --url 'https://mcp.supabase.com/mcp?project_ref=xvrndwkghxkqsvxxtqym&features=database,debugging,development,docs'
```

Codex 0.160.1 detected OAuth and reported `Successfully logged in`. Subsequent `codex mcp list --json` reports `supabase` enabled, using streamable HTTP and OAuth authentication. The connection is restricted to the confirmed project. Credentials remain in Codex's supported private OAuth storage; none were copied into the repository, shell arguments, or this report. No read-only flag was added.

The endpoint and project scoping follow the [official Supabase MCP guide](https://supabase.com/docs/guides/ai-tools/mcp).

## Live validation

The active chat's hosted tool inventory does not refresh merely because a native server was added. Juan independently verified the installed app-server schema and the supported direct tool route. A temporary local helper uses `initialize`, an ephemeral `thread/start`, `mcpServerStatus/list`, and `mcpServer/tool/call` over stdio. It starts no model turn, creates no persistent agent thread and extracts no credentials. Other configured MCP servers are disabled only through process-local overrides. The helper shuts down its app-server after each call.

Actual tool calls passed:

| Check | Result |
| --- | --- |
| Native server status | OAuth authenticated; 11 database, debugging, development and documentation tools available, including `execute_sql` and `apply_migration` |
| `get_project_url` | `https://xvrndwkghxkqsvxxtqym.supabase.co`, matching the confirmed target |
| `list_migrations` | 57 live migration-history records; latest recorded version `20260811182630` / `move_privileged_rpcs_to_private_schema` |
| Metadata SQL | Database role `postgres`; transaction and default read-only settings both `off`; public-schema CREATE and database CREATE privileges true |
| Application schema | `public.teams`, `public.songs`, `public.events`, and `public.setlists` all present |
| Write-permission SQL | Zero-row `UPDATE public.songs SET title = title WHERE false` executed inside `BEGIN` / `ROLLBACK`; INSERT, UPDATE and DELETE privileges on Songs all true |

The write probe changed no rows and left no committed data or schema changes. It created no migration-history record. Schema CREATE privilege and migration-tool availability were inspected; no real schema migration was applied to test that capability.

Raw metadata tool responses, exact probe queries and helper SHA-256 are recorded in [connection evidence](T21-SUPABASE-CONNECTION-2026-10-07.json). The temporary helper is at `%TEMP%\anointed-supabase-connection\mcp_bridge.py`; it provides the direct-tool path in this session while the hosted plugin remains unavailable.

## Remaining scope

This resolves the scoped connection problem. It does not constitute a website release, a migration-chain reconciliation, or authenticated product validation. T21 and T08 remain Testing. SQL Editor execution can exist without a CLI migration-history record, so absence from this history does not establish whether the user-reported T08 SQL is deployed. No original migration was rerun, no new workflow migration was applied, and no deployment or push occurred.

## Independent acceptance and gates

Juan passed the protocol-route investigation independently. Laura passed scoped connection QA after fresh `get_project_url` and read-only `execute_sql` calls, both exiting 0. She reviewed the coordinator's successful rollback probe without repeating writes. Her structural configuration comparison found only the Supabase server addition and removal of an empty `node_repl.args` array, which is equivalent to its omitted default. All other parsed settings were unchanged. She verified the helper hash, ephemeral thread, absence of model inference and credential extraction, and process cleanup. Both specialists loaded the required installed skills; no missing skill gate was claimed passed.

Relevant engineering gates are satisfied for this scoped repair:

| Gates | Disposition and evidence |
| --- | --- |
| 01–12: scope, ownership, boundaries, design and verification | Passed. User authorized connection repair; coordinator owns configuration/docs, Juan reviews protocol and Laura verifies independently. Confirmed project scope and live metadata/write-permission results above. |
| 13: isolated parallel implementation | N/A. One configuration writer; both specialists read-only. |
| 14–18, 21–22: skills, conventions, reuse, input and error handling | Passed where applicable. Native CLI/OAuth and installed protocol reused; temporary stdlib helper validates JSON-RPC responses, surfaces failures and cleans up. TypeScript discipline (16) is N/A because no TypeScript changed. |
| 19–20: bundle and hydration | N/A. No application rendering changes. |
| 23–29: schema compatibility, recovery, volume and RLS CRUD | N/A to this connection repair. No schema or RLS change; operator capability checks do not substitute for product authorization tests. |
| 30–32: application build, typecheck and lint | N/A. Only account connection configuration and evidence changed. TOML/JSON parse, CLI discovery, fresh live tool checks and independent structural configuration review provide relevant validation. |
| 33: integration verification | Passed. Confirmed target URL, history, core schema and write capability; independent read checks repeated successfully. |
| 34, 36: product E2E and accessibility | N/A. No product/UI behavior changed. |
| 35: security and dependency risk | Passed for scoped configuration. Project restriction, private OAuth storage, preserved existing settings, no credential output and no added dependency. |
| 37: final evidence and diff | Connection criteria accepted by independent QA; repository whitespace and evidence checks recorded in the ticket settlement. |

The broader T21 release gates remain open as stated above.
