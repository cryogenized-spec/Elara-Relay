# Supabase / PostgreSQL Runtime

Elara Relay treats Supabase as a PostgreSQL host, not as the owner of the
application architecture.

The persistent Node runtime uses `DATABASE_URL`. The browser must never
receive this value. Hosted Supabase Edge Functions use Supabase's injected
`SUPABASE_DB_URL` instead, which likewise remains server-only.

For a remote Supabase connection, the runtime requires TLS. A URL without an
`sslmode` parameter is normalized to `sslmode=require`. Explicitly disabling
TLS for a remote host is rejected. Local development connections may use
`sslmode=disable`.

The same `PostgresDomainStore` contract is used by Supabase, a local
PostgreSQL service, or another compatible PostgreSQL host.

## Runtime variables

- `DATABASE_URL`: required PostgreSQL connection string.
- `ELARA_DB_POOL_MAX`: maximum pool size, default 5, maximum 20.
- `ELARA_DB_IDLE_TIMEOUT_MS`: idle connection timeout, default 30000.
- `ELARA_DB_CONNECTION_TIMEOUT_MS`: connect timeout, default 10000.
- `ELARA_DB_STATEMENT_TIMEOUT_MS`: per-statement timeout, default 10000, maximum 60000.

The checked-in `.env.example` contains local placeholders only. Never commit
a production database password or Supabase service-role credential.


## Hosted Supabase Edge runtime

The production Operations API can run as the `elara-api` Supabase Edge
Function. This keeps the existing Hono -> Domain Kernel -> PostgreSQL
authority intact; the Edge entry point is an adapter, not a second
application architecture.

Hosted Edge Functions receive `SUPABASE_DB_URL`, `SUPABASE_URL`, and
`SUPABASE_PUBLISHABLE_KEYS` from Supabase automatically. Elara uses the
database URL only inside the function and limits its application-side
PostgreSQL pool to one connection per isolate.

The function gateway has `verify_jwt = false` because Elara accepts modern
Supabase publishable keys and performs session verification inside the
existing `SupabaseAuthVerifier`. Protected routes still require an
authenticated, non-anonymous Supabase session whose user UUID appears in
`ELARA_ALLOWED_USER_IDS`.

If `ELARA_ALLOWED_USER_IDS` has not yet been configured, the Edge runtime
uses a fixed sentinel UUID and reports that the owner allowlist is
unconfigured. This deliberately leaves all protected routes fail-closed while
allowing the public `/health` route to prove the deployment is alive. Set the
real owner UUID before using operational routes.

`ELARA_ALLOWED_ORIGINS` may override the browser CORS allowlist. Hosted Edge
deployment defaults to `https://cryogenized-spec.github.io`, the GitHub Pages
origin used by the Elara PWA.

The public function base URL is:

`https://<project-ref>.supabase.co/functions/v1/elara-api`

That URL is the production value for `VITE_ELARA_API_URL`.

## Migration rule

DDL remains source-controlled under `src/db/migrations/`. A live Supabase
project should receive those reviewed migrations through the migration API;
the application runtime does not auto-create or mutate its schema on startup.

## Browser access boundary

Operational tables live in the `public` schema only because Supabase exposes
that schema by default. Elara does not use browser-to-table access.

Migration `0002_security_hardening.sql` enables RLS on all operational tables
and revokes direct table privileges from both `anon` and `authenticated`.
No client policies are installed in Phase 1. The application server connects
to PostgreSQL directly and remains the only supported mutation/read gateway for
operational data.

Subsequent migrations apply the same RLS/no-browser-CRUD boundary to Repairs and
Scheduler tables.

The append-only event trigger pins its function `search_path` to
`pg_catalog, public` so object resolution cannot be redirected by a caller's
role-level search path.

## Application authentication boundary

Operational API routes require a Supabase Auth access token. The public
`/health` endpoint remains unauthenticated; operational domain routes are protected.

The server verifies asymmetric Supabase session JWTs against the project's
JWKS endpoint and validates issuer, audience, expiry, role, anonymous-session
state, and a stable user-ID allowlist. If a project still emits legacy HS256
session tokens, Elara validates the token through `/auth/v1/user` with the
project's modern publishable key rather than storing the legacy JWT secret.

`ELARA_ALLOWED_USER_IDS` is mandatory and must contain at least one Supabase
Auth user UUID. This keeps the initial deployment owner-only even if project-level
signup configuration changes unexpectedly.

Both JWKS and user-endpoint fetches are bounded by
`ELARA_AUTH_REQUEST_TIMEOUT_MS` (default 5000, maximum 30000) so a stalled
Auth server fails closed instead of stalling request workers.

Mutation actor provenance is server-owned. Browser requests do not submit
`actor`; the authenticated operator API records `operator-ui`. Future
ChatGPT and embedded-AI adapters must receive separate authenticated server
entry points rather than impersonating the operator route.

## Live migration state

As of 2026-09-24, the live Elara Relay Supabase project has applied:

- `0001_domain_kernel`
- `0002_security_hardening`
- `0003_repairs_domain`
- `0004_scheduler`

The operational tables were empty at the Pass 1E verification boundary.
