# Production health and observability contract

Elara's observability boundary is provider-neutral and uses the existing Node,
Hono, PostgreSQL, and stderr facilities. It adds no commercial monitoring or
logging SDK and does not put a vendor in the domain architecture.

## Public health endpoints

All three endpoints are unauthenticated and return only service/build metadata
and component states. They never read operational tables or return identities,
records, user data, exception messages, credentials, database URLs, tokens, or
stack traces. Responses use `Cache-Control: no-store` and include a
server-generated `X-Request-ID` header.

### `GET /health` and `GET /health/live`

These are liveness probes and are aliases. They do not contact PostgreSQL,
Supabase Auth, a scheduler worker, or an optional provider. A `200` response
means the API process is alive enough to answer the request; it does not claim
readiness.

```json
{
  "service": "elara-relay",
  "status": "ok",
  "version": "0.0.0",
  "buildSha": "unknown",
  "schemaVersion": 1
}
```

`version` comes from the checked-in package version. Set `ELARA_BUILD_SHA` to a
public Git SHA (7–40 hexadecimal characters) to identify a deployment build;
invalid values are reported as `unknown`. No other environment value is
reflected in health output.

### `GET /health/ready`

Readiness performs one constant-only `SELECT 1` through the configured
PostgreSQL pool. It releases the client in both success and failure cases and
does not query application/domain tables. A `200` means the API routes are
assembled, the database probe succeeded, and required authentication
configuration passed validation. A `503` means at least one of those core
conditions is not satisfied.

```json
{
  "service": "elara-relay",
  "status": "ready",
  "version": "0.0.0",
  "buildSha": "unknown",
  "schemaVersion": 1,
  "checks": {
    "database": "available",
    "authentication": "valid",
    "scheduler": "not_configured",
    "optionalProviders": {
      "memory": "disabled"
    }
  }
}
```

The readiness body is a fixed status vocabulary; failed probes do not include
raw errors or diagnostics.

| Check | States | Meaning |
| --- | --- | --- |
| `database` | `available`, `unavailable`, `not_configured` | `available` follows a successful `SELECT 1`; connection/query failures are `unavailable`. |
| `authentication` | `valid`, `invalid`, `not_configured` | `valid` means runtime auth settings passed local validation during assembly. Supabase Auth network reachability is not probed here; token verification remains bounded and fail-closed on protected requests. Invalid required configuration currently prevents runtime assembly. |
| `scheduler` | `operational`, `unavailable`, `disabled`, `not_configured` | Separate scheduler-worker state. The current API assembly does not start a scheduler worker or delivery adapter, so it reports `not_configured` unless a host supplies a scheduler status probe. |
| `optionalProviders` | per provider: `configured`, `unavailable`, `disabled` | Safe capability state, independent of core API readiness. Current runtime reports the optional `memory` capability. |

The API readiness decision depends on assembled routes, `database: available`,
and `authentication: valid`. Scheduler and optional-provider states remain
visible but do not make the manual operations API unready. This keeps optional
AI/memory outages from making the manual product appear completely dead. A
scheduler worker can be monitored independently and can supply a local
`SchedulerHealthProbe` when assembled by a deployment host.

Optional-provider state is observational, not an active remote ping:

- `disabled`: the null/no-op provider is deliberately selected (also the
  default when no memory provider is configured).
- `configured`: the capability is enabled and has not had a latest observed
  provider failure (or has recovered after a successful operation).
- `unavailable`: a provider operation failed. A later successful operation
  returns the state to `configured`.
- Local secret screening is a refusal to send an unsafe request, not a provider
  outage, and does not mark memory unavailable.

The status map uses only the fixed capability keys `memory`, `ai`, `chat`,
`delivery`, `email`, `storage`, `workspace`, `calendar`, and `notifications`;
unknown/provider-vendor keys are omitted. The current runtime reports only
`memory`. Provider outages never change the readiness HTTP status.

## Correlation and internal logs

The API generates a fresh UUID request ID for every request and returns it as
`X-Request-ID`; caller-supplied request IDs are ignored. The header is exposed
to browsers only for origins already allowed by `ELARA_ALLOWED_ORIGINS`.

Production runtime logs are JSON Lines to stderr through a small
`StructuredLogger` interface. Each line has an ISO-8601 `timestamp`, fixed
`event`/`level` values, safe category fields, and a request ID where a request
exists. For example:

```json
{"timestamp":"2026-09-27T12:00:00.000Z","event":"api.failure","level":"warn","requestId":"550e8400-e29b-41d4-a716-446655440000","category":"authentication","status":401}
```

Current event categories are:

- `api.failure`: one of `authentication`, `authorization`, `validation`,
  `not_found`, `conflict`, or `unexpected`, plus the HTTP status and request ID.
- `health.dependency_unavailable`: `database` or `scheduler`, the fixed
  `readiness_probe_failed` category, and request ID.
- `postgres.pool_error`: a fixed idle-client category only; the raw pg error is
  intentionally discarded.
- `optional_provider.failure`: `memory`, operation (`retain`/`recall`), and a
  safe code (`http`, `timeout`, `network`, `invalid-response`,
  `secret-blocked`, or `unknown`).

Logs never include exception messages, stack traces, SQL values, URLs, request
paths/bodies, bearer tokens, user identifiers, provider response bodies, or
credentials. Log sinks are best-effort and cannot change application/domain
outcomes. No logging/monitoring vendor is referenced by the domain or provider
ports.

Expected application/domain failures retain their existing HTTP semantics
(401/403 authentication/authorization, 400 validation, 404 not found, 409
conflict). Unexpected failures return only the generic `INTERNAL_ERROR`
response; the internal log records only the safe `unexpected` category and
request ID.

## Configuration and deployment notes

- `ELARA_BUILD_SHA` is optional public metadata; it is never a secret.
- Liveness should be used for process restart decisions.
- Readiness should be used for API traffic admission.
- Monitor the `scheduler` and `optionalProviders` fields separately when those
  capabilities are enabled; their degradation does not imply database/API
  death.
- Health routes do not replace rate limiting, transport security, backups, or
  the production deployment's broader security controls.
