# Supabase / PostgreSQL Runtime

Elara Relay treats Supabase as a PostgreSQL host, not as the owner of the
application architecture.

The server-side runtime needs only `DATABASE_URL`. The browser must never
receive this value.

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
- `ELARA_READINESS_TIMEOUT_MS`: readiness round-trip deadline, default 2000, maximum 10000.

The checked-in `.env.example` contains local placeholders only. Never commit
a production database password or Supabase service-role credential.

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

## Production deployment planes

Elara deploys as two separate planes that share no secret.

The privileged Operations API is one Node 24 ESM artifact built from
`src/runtime/node/main.ts` (`npm run build:server` →
`dist-server/server.mjs`, run with `npm start`). The browser plane is the
static GitHub Pages build and receives only public `VITE_*` values.

No proprietary hosting provider is an architectural dependency. The API needs
a Node 24 runtime, injected environment variables, TCP routing to a port, and
`SIGTERM`.

Startup fails closed. `NODE_ENV` selects the profile, an absent value is
treated as production, and in production the listen socket (`ELARA_HOST`,
`PORT`) and every trusted browser origin (HTTPS only) must be declared
explicitly. The configuration contract is validated before a socket or a pool
is opened, PostgreSQL is then proven reachable with a bounded `select 1`, and
a rejected startup exits `1` naming variables without echoing values.
Unrecognized variables in the `ELARA_` namespace are rejected so a typo cannot
silently disable a boundary.

`GET /health` is liveness and never touches PostgreSQL. `GET /ready` is the
traffic gate: it answers `200` only while the database is reachable and the
instance is not draining, and both endpoints answer with a fixed status word
so an unauthenticated probe discloses nothing. On termination, readiness flips
first, in-flight requests drain inside `ELARA_SHUTDOWN_TIMEOUT_MS`, and then
the HTTP socket and the PostgreSQL pool are closed.

The full runtime configuration contract — required server variables, public
browser variables, secret storage, startup procedure, health/readiness
behavior, deployment assumptions, and rollback — lives in
[`docs/production-deployment.md`](../../docs/production-deployment.md).

## Live migration state

As of 2026-09-24, the live Elara Relay Supabase project has applied:

- `0001_domain_kernel`
- `0002_security_hardening`
- `0003_repairs_domain`
- `0004_scheduler`

The operational tables were empty at the Pass 1E verification boundary.
