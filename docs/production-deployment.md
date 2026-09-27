# Production deployment

Elara Relay deploys as **two separate planes**. They are built separately,
configured separately, and never share a secret.

| Plane | Artifact | Runtime | Configuration source |
| --- | --- | --- | --- |
| Browser (public) | `dist/` static assets | GitHub Pages / any static host | `VITE_*` values inlined at build time |
| Operations API (privileged) | `dist-server/server.mjs` | Node.js 24 | `process.env` at run time, from the platform secret store |

The browser plane already ships through `.github/workflows/pages.yml`. This
document covers the privileged Node plane.

No proprietary hosting provider is an architectural dependency. The API is a
single ESM artifact that binds an HTTP socket, reads PostgreSQL over `pg`, and
verifies Supabase Auth tokens over HTTPS. Any Node 24 runtime that can inject
environment variables, route TCP to a port, and send `SIGTERM` can host it —
a container platform, a VM under a process supervisor, or a self-managed
Node install behind an existing gateway.

## Required server variables

`NODE_ENV` selects the deployment profile. Only `production`, `development`,
and `test` are recognized. **An absent `NODE_ENV` is treated as
`production`**, and an unrecognized value is a startup failure: a missing
declaration can never relax a production requirement.

Required in every profile:

| Variable | Purpose | Notes |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | Secret. Remote hosts must use TLS: a missing `sslmode` is normalized to `sslmode=require`, and `sslmode=disable` is rejected for any non-loopback host. |
| `SUPABASE_URL` | Supabase project origin used for JWT verification | Must be HTTPS, without credentials or path. |
| `SUPABASE_PUBLISHABLE_KEY` | Modern publishable key for the legacy-HS256 fallback path | Must start with `sb_publishable_`. A legacy anon/JWT secret is rejected. |
| `ELARA_ALLOWED_USER_IDS` | Owner authorization allowlist | At least one Supabase Auth user UUID, no duplicates. Keeps the deployment owner-only even if project signup settings change. |
| `ELARA_ALLOWED_ORIGINS` | Trusted browser origins for CORS | Comma-separated exact origins. No wildcards, no paths, no embedded credentials, no duplicates. |

Additionally required when the profile is `production`:

| Variable | Purpose | Notes |
| --- | --- | --- |
| `ELARA_HOST` | Listen interface | Bare IP or hostname — never a URL, scheme, path, or credential. Use `0.0.0.0` inside a container, or an explicit interface address on a VM. |
| `PORT` | Listen port | Integer `0`–`65535`. `0` requests an OS-assigned ephemeral port (test/harness use). |

Optional server variables (defaults shown):

| Variable | Default | Bound | Purpose |
| --- | --- | --- | --- |
| `ELARA_DB_POOL_MAX` | `5` | ≤ 20 | PostgreSQL pool size |
| `ELARA_DB_IDLE_TIMEOUT_MS` | `30000` | positive integer | Idle connection timeout |
| `ELARA_DB_CONNECTION_TIMEOUT_MS` | `10000` | positive integer | Connect timeout |
| `ELARA_DB_STATEMENT_TIMEOUT_MS` | `10000` | ≤ 60000 | Per-statement timeout; bounds one wedged query |
| `ELARA_AUTH_REQUEST_TIMEOUT_MS` | `5000` | ≤ 30000 | JWKS and `/auth/v1/user` fetch timeout |
| `ELARA_SHUTDOWN_TIMEOUT_MS` | `10000` | ≤ 60000 | Drain deadline before connections are force-closed |
| `ELARA_READINESS_TIMEOUT_MS` | `2000` | ≤ 10000 | Readiness round-trip deadline |
| `ELARA_HTTP_REQUEST_TIMEOUT_MS` | `30000` | ≤ 120000 | Whole-request socket timeout |
| `ELARA_HTTP_KEEP_ALIVE_TIMEOUT_MS` | `65000` | ≤ 300000 | Idle keep-alive timeout; align with the terminating gateway |
| `ELARA_MEMORY_PROVIDER` | `none` | `none` \| `hindsight` | Optional AI memory adapter |
| `ELARA_HINDSIGHT_URL` | — | HTTPS (HTTP on loopback only) | Required when the provider is `hindsight` |
| `ELARA_HINDSIGHT_API_KEY` | — | secret | Required for non-loopback Hindsight |
| `ELARA_MEMORY_REQUEST_TIMEOUT_MS` | `5000` | ≤ 30000 | Memory adapter request timeout |
| `ELARA_CHAT_REQUEST_TIMEOUT_MS` | `120000` | ≤ 600000 | Chat provider request timeout |
| `ELARA_BUILD_SHA` | `unknown` | 7–40 hex chars | Public build identifier for health output |

Unrecognized variables inside the `ELARA_` namespace are a **startup failure**.
A typo such as `ELARA_ALLOW_ORIGINS` would otherwise leave CORS silently
unconfigured. Platform variables outside that namespace are never policed.

Optional Chat provider variables are server-only:
`ELARA_OPENAI_API_KEY`, `ELARA_OPENAI_BASE_URL`, `ELARA_MUSE_API_KEY`,
and `ELARA_MUSE_BASE_URL`. A provider is enabled only when its corresponding
key is present.

## Public browser variables

The browser plane reads exactly three values, inlined by Vite at build time
(`src/app/runtime-config.ts`):

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project origin for browser sign-in |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key; must start with `sb_publishable_` |
| `VITE_ELARA_API_URL` | Public base URL of the Operations API |

Everything the browser receives is public by design: a publishable key, a
project origin, and the API URL. The browser never receives `DATABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY` (the server copy), `ELARA_ALLOWED_USER_IDS`,
`ELARA_ALLOWED_ORIGINS`, or any memory-provider credential, and it has no
direct table access: RLS is enabled and `anon`/`authenticated` table
privileges are revoked.

`VITE_ELARA_API_URL` must be an origin listed in the API's
`ELARA_ALLOWED_ORIGINS`, or every browser request will be refused by CORS.
HTTPS is required outside loopback development.

## Secret storage

| Value | Storage |
| --- | --- |
| `DATABASE_URL` (includes the PostgreSQL password) | Platform secret store — server runtime only |
| `ELARA_HINDSIGHT_API_KEY` (when a memory provider is used) | Platform secret store — server runtime only |
| `SUPABASE_PUBLISHABLE_KEY` | Server environment. Publishable by design, but it is not a browser build value and must not be inlined into static assets. |
| `SUPABASE_URL`, `ELARA_ALLOWED_USER_IDS`, `ELARA_ALLOWED_ORIGINS`, `ELARA_HOST`, `PORT`, timeouts | Server environment (deployment configuration, not credentials) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_ELARA_API_URL` | Repository/platform **variables** (public). Never the secret store. |

Rules:

- Secrets are injected into the running process by the platform. The server
  build inlines nothing: `vite.server.config.mjs` sets `envPrefix: []` and the
  artifact reads `process.env` at run time.
- Never commit a `.env` file, a production database password, a Supabase
  service-role key, or a legacy JWT secret. `.env` and `.env.*` are ignored;
  only `.env.example` (local placeholders) is tracked, and
  `npm run secrets:check` enforces that.
- No secret may reach a client, an error body, or a log line. Startup
  diagnostics name variables and fixed reasons only, and every diagnostic
  passes a redaction layer that strips connection URLs, credential fields,
  JWT-shaped tokens, provider keys, and long opaque values.

## Startup procedure

Build and run:

```bash
npm ci --ignore-scripts --no-audit --no-fund   # exact lockfile, full graph
npm run build:server                           # emits dist-server/server.mjs
npm prune --omit=dev                           # runtime dependencies only
npm start                                      # node dist-server/server.mjs
```

Local development against a `.env` file:

```bash
npm run build:server
npm run start:local     # node --env-file-if-exists=.env dist-server/server.mjs
```

Values already present in the process environment take precedence over a
`.env` file, so a platform-injected secret can never be overridden by a stale
local file.

Startup order is fixed, and each step either succeeds or ends the process:

1. **Validate the configuration contract.** Every section is evaluated, so one
   rejected startup reports all missing variables plus the first invalid value
   per section. No socket is opened and no pool is created at this point.
2. **Assemble the runtime.** Supabase JWT verifier, optional memory adapter,
   PostgreSQL pool, domain kernel, and the Hono API (with the readiness probe
   and the trusted browser origins).
3. **Prove the database reachable** with a bounded `select 1` inside
   `ELARA_READINESS_TIMEOUT_MS`. An unreachable database is a startup failure,
   not a silently degraded instance.
4. **Bind the HTTP socket** on `ELARA_HOST:PORT`, then log
   `listening on <host>:<port>`.

Exit codes: `0` after a clean drained shutdown, `1` for a refused startup or a
fatal teardown. A refused startup always logs `startup aborted (<stage>); no
traffic was served`.

**Startup never migrates schema.** DDL lives only in reviewed migrations under
`src/db/migrations/` and is applied out of band (for a Supabase project,
through the migration API). The runtime issues no DDL, reads no migration
file, and `npm run production:check` fails if either appears in the server or
API sources.

## Health and readiness

Two unauthenticated endpoints with deliberately different meanings:

| Endpoint | Meaning | Touches PostgreSQL | Answers |
| --- | --- | --- | --- |
| `GET /health` / `GET /health/live` | Liveness: the process is serving | No | `200` with safe build metadata |
| `GET /health/ready` | Readiness: route traffic here | Yes (`select 1`, bounded) | `200` when core dependencies are ready and not draining, otherwise `503` |

Bodies remain safe and coarse. Liveness exposes only service/version/build metadata.
Readiness additionally exposes fixed component states for database,
authentication, scheduler, and optional providers; it never exposes hostnames,
queries, driver messages, exception text, or credentials.

Properties an operator can rely on:

- No hostname, driver message, query text, stack trace, version, or
  configuration detail is ever returned. A failing probe answers `503` with
  the same body as a draining one.
- A missing probe fails closed: `/health/ready` answers `503` rather than pretending
  to be ready.
- A probe that throws is treated as unavailable, never as a `500`.
- Liveness does not flap when PostgreSQL is slow or down; only readiness does.
  Point a platform liveness check at `/health` and its traffic gate at
  `/health/ready`.
- Both endpoints sit behind CORS like every other route, and both are excluded
  from bearer verification so a gateway can probe them without a token.

## Graceful shutdown

On `SIGTERM` or `SIGINT`:

1. Readiness flips to `503` immediately, so the gateway stops routing new
   traffic to this instance.
2. The HTTP socket stops accepting connections and idle keep-alive sockets are
   closed.
3. In-flight requests drain until `ELARA_SHUTDOWN_TIMEOUT_MS` elapses; the
   deadline then forces remaining connections closed and logs
   `shutdown deadline exceeded`.
4. The PostgreSQL pool is closed inside the remaining budget.
5. The process exits `0` and logs `shutdown complete`.

A repeated termination signal escalates immediately to forcing connections
closed. `uncaughtException` and `unhandledRejection` run the same teardown and
exit `1`.

Set the platform's termination grace period higher than
`ELARA_SHUTDOWN_TIMEOUT_MS` (for example 30 s against a 10 s drain) so the
runtime, not the platform's `SIGKILL`, decides when draining ends.

## Deployment assumptions

- **Node.js 24.x** (`.nvmrc` pins `24.21.0`) and npm `11.19.0`. The artifact
  is ESM and depends on `hono`, `jose`, `pg`, and `zod` resolved from a
  production `node_modules` installed from the exact lockfile.
- **TLS terminates at the gateway.** The API binds plain HTTP and sets no
  `Strict-Transport-Security` header; HTTPS termination, HSTS, and any
  edge CSP/frame policy belong to the hosting layer. See
  `docs/security-follow-ups.md`.
- **The API is not a static file server.** The browser plane is deployed
  separately; nothing in the API serves `dist/`.
- **Proxy headers are not trusted.** No client identity, scheme, or rate-limit
  decision is derived from `X-Forwarded-*`. Rate limiting remains a
  deployment-scope decision tracked in `docs/security-follow-ups.md`.
- **The database user is the application role**, not `postgres` superuser
  where avoidable, and must not be the Supabase `anon`/`authenticated` role:
  those have no operational table privileges.
- **Migrations are applied before the new artifact is rolled out**, through
  the reviewed migration path, never by the application.
- **One instance is sufficient** for the owner-only Phase 1 deployment; the
  runtime is stateless apart from its connection pool, so it scales
  horizontally without coordination. The Scheduler dispatcher remains a
  separate execution boundary and is not started by this artifact.
- **Outbound network access** is required to the PostgreSQL host and to the
  Supabase project origin (JWKS and, for legacy tokens, `/auth/v1/user`).
- Every response carries `Cache-Control: no-store` and
  `X-Content-Type-Options: nosniff`; CORS preflight responses are left
  untouched so `Access-Control-Max-Age` caching still works.
- Request bodies are capped at 1 MB by the API, sockets are bounded by
  `ELARA_HTTP_REQUEST_TIMEOUT_MS`, and every statement is bounded by
  `ELARA_DB_STATEMENT_TIMEOUT_MS`.

## Rollback

- **Artifact rollback is a redeploy of the previous `dist-server/server.mjs`.**
  The runtime is stateless and holds no schema authority, so rolling back code
  never requires rolling back the database.
- **Drain before replacing.** Because readiness flips to `503` on `SIGTERM`,
  a rolling replacement stops receiving new work before its connections are
  drained. Keep the platform grace period above
  `ELARA_SHUTDOWN_TIMEOUT_MS`.
- **Migrations are forward-only.** A migration that has been applied to a live
  database is not reverted by a code rollback, and an already-live migration
  file is never rewritten. If a migration must be undone, ship a new reviewed
  migration that corrects forward — a correction creates new history.
- **Deploy migrations before the artifact that needs them**, and keep the
  previous artifact compatible with the new schema where practical, so a
  rollback window exists between the two steps.
- **Configuration rollback is a secret-store rollback.** Restore the previous
  `DATABASE_URL` / allowlist values and restart. A rejected configuration
  fails closed at startup, so a bad rollback surfaces immediately as exit
  code `1` with the offending variable names rather than as a
  partially-working instance.
- **Browser plane rollback is independent** (GitHub Pages artifact
  redeployment). Because `VITE_ELARA_API_URL` is baked into the static build,
  an API URL change requires a browser rebuild, not just an API redeploy.

## Certification

`npm run production:check` (and the matching CI step) certifies this contract
against the real artifact:

- configuration contract markers, CORS controls, lifecycle ordering, and
  transport hardening are present in source
- no DDL and no migration-file access in the server or API sources
- no server-only identifier in browser sources, and no browser-plane import in
  server sources
- `.env.example` documents exactly the variables the runtime reads
- the built server artifact inlines no environment value, references no
  `VITE_*` variable, and embeds no credentialed connection string; browser
  bundles contain no server-only identifier
- the artifact refuses to start (exit `1`, no socket) for an empty
  environment, an unreachable database, an unrecognized `ELARA_*` variable, an
  insecure production origin, and a remote database without TLS — without
  leaking a configured secret value into its output
- with a reachable `DATABASE_URL` supplied, the artifact boots and is
  certified live: `/health` and `/health/ready` bodies, `401` for anonymous reads,
  `401` (not `404`) for unknown endpoints, trusted-origin preflight accepted,
  untrusted origin refused, oversized unauthenticated write refused with a
  non-reusable socket, `no-store` on responses, and a clean `0` exit on
  `SIGTERM`

Run the live section locally with:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/elara?sslmode=disable \
  npm run production:check
```

CI sets `GATE_REQUIRE_DATABASE=1`, which turns the live boot section from a
skip into a hard requirement.
