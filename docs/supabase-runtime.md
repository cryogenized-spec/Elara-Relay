# Supabase / PostgreSQL runtime

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

## Production server entrypoint

The privileged API plane is built and run separately from the browser plane:

- entrypoint: `src/runtime/node/main.ts`
- artifact: `npm run build:server` → `dist-server/server.mjs`
- run: `npm start` (configuration comes from the process environment)

`NODE_ENV` selects the deployment profile. An absent value is treated as
`production`; an unrecognized value is a startup failure. In production the
listen socket must be declared explicitly with `ELARA_HOST` and `PORT`, and
every trusted browser origin must use HTTPS.

Startup validates the whole contract before opening a socket or a pool,
assembles the runtime, proves PostgreSQL reachable with a bounded `select 1`,
and only then binds. A rejected startup exits `1` and names the offending
variables without echoing their values.

The complete contract — required and public variables, secret storage,
startup, health/readiness, deployment assumptions, and rollback — is in
[`production-deployment.md`](production-deployment.md).

## Health and readiness

- `GET /health` is liveness. It never touches PostgreSQL and always answers
  `200` with a fixed body while the process is serving.
- `GET /ready` is the traffic gate. It runs a bounded `select 1` and answers
  `200` only while the database is reachable and the instance is not draining;
  otherwise `503`.

Both are unauthenticated, so both answer with a fixed status word and nothing
else: no host, driver message, query, version, or stack detail. A missing or
throwing readiness probe fails closed as unavailable.

On `SIGTERM`/`SIGINT` readiness flips to `503` first, the socket stops
accepting connections, in-flight requests drain within
`ELARA_SHUTDOWN_TIMEOUT_MS`, and then the HTTP server and PostgreSQL pool are
closed before the process exits `0`.

## Migration rule

DDL remains source-controlled under `src/db/migrations/`. A live Supabase
project should receive those reviewed migrations through the migration API;
the application runtime does not auto-create or mutate its schema on startup.

The production server enforces this: it issues no DDL and reads no migration
file, and `npm run production:check` fails if either appears in the server or
API sources. The startup readiness check is `select 1` — reachability only,
never schema inspection or creation.


## Browser access boundary

Operational tables live in the `public` schema only because Supabase exposes
that schema by default. Elara does not use browser-to-table access.

Migration `0002_security_hardening.sql` enables RLS on all operational tables
and revokes direct table privileges from both `anon` and `authenticated`.
No client policies are installed in Phase 1B. The application server connects
to PostgreSQL directly and remains the only supported mutation/read gateway for
operational data.

The append-only event trigger also pins its function `search_path` to
`pg_catalog, public` so object resolution cannot be redirected by a caller's
role-level search path.


## Application authentication boundary

Operational API routes require a Supabase Auth access token. The public
`/health` endpoint remains unauthenticated; Parties, Jobs, Tasks, Today,
Search, and identity inspection are protected.

The server verifies asymmetric Supabase session JWTs against the project's
JWKS endpoint and validates issuer, audience, expiry, role, anonymous-session
state, and a stable user-ID allowlist. If a project still emits legacy HS256
session tokens, Elara follows Supabase's recommended fallback and validates
the token through `/auth/v1/user` with the project's modern publishable key
rather than storing the legacy JWT secret.

`ELARA_ALLOWED_USER_IDS` is mandatory and must contain at least one Supabase
Auth user UUID. This keeps the initial Elara deployment owner-only even if
project-level signup configuration changes unexpectedly.

Both JWKS and user-endpoint fetches are bounded by
`ELARA_AUTH_REQUEST_TIMEOUT_MS` (default 5000, maximum 30000) so a stalled
Auth server fails closed instead of stalling request workers.

Mutation actor provenance is server-owned. Browser requests do not submit
`actor`; the authenticated operator API records `operator-ui`. Future
ChatGPT and embedded-AI adapters must receive separate authenticated server
entry points rather than impersonating the operator route.

## Browser CORS boundary

The browser UI is deployed as a separate static plane (GitHub Pages) from the
Operations API. The API therefore enables CORS only for exact origins listed
in `ELARA_ALLOWED_ORIGINS`.

- Configure a comma-separated list of exact origins.
- Production origins must use HTTPS; a plain-HTTP origin is a startup failure
  in the production profile.
- Wildcard and relative hosts are rejected, so trust is always one exact
  origin and never a pattern.
- HTTP is accepted only for loopback development origins such as
  `http://127.0.0.1:4173`.
- Paths, embedded credentials, query strings, fragments, and duplicate origins
  are rejected.
- Preflight permits the `Authorization` and `Content-Type` headers and only
  the API methods used by Elara.
- CORS runs before bearer verification so browser preflight never requires a
  token.
- A disallowed origin receives no CORS authorization; it does not expand the
  server-side identity allowlist.
