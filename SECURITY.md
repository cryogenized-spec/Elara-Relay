# Security Policy

Elara Relay is an actively developed operations platform with a strong emphasis
on authentication, data isolation, mutation integrity, auditability, and
server-side control of privileged operations.

Security reports are welcome and should be disclosed privately.

## Supported Versions

Elara Relay has not yet reached its first stable public release.

At this stage, security fixes are applied to the current `main` branch.

| Version / Branch | Supported |
| --- | --- |
| `main` | ✅ |
| Current development branches | ⚠️ Best effort |
| Historical commits and abandoned branches | ❌ |

Once Elara Relay begins publishing versioned releases, this section will be
updated with an explicit release-support policy.

## Reporting a Vulnerability

Please do **not** report suspected security vulnerabilities through a public
GitHub Issue, Discussion, pull request, or other public channel.

Use GitHub's **Private Vulnerability Reporting** feature for this repository.

When reporting a vulnerability, please include as much of the following as is
reasonably available:

- a description of the issue
- the affected component or file
- steps required to reproduce it
- the security impact
- relevant logs or screenshots with secrets removed
- a proof of concept, if appropriate
- any suggested mitigation

Please do not include API keys, access tokens, database credentials, private
keys, bearer tokens, customer information, or other sensitive data in the
report unless they are strictly necessary to demonstrate the issue.

## Security-Relevant Areas

Reports are particularly useful when they concern areas such as:

- authentication or authorization bypass
- cross-owner or cross-user data access
- PostgreSQL or Row Level Security isolation failures
- accidental browser access to server credentials
- secret or token exposure
- mutation replay or idempotency failures
- optimistic revision bypasses
- unauthorized modification of append-only Events
- scheduler duplicate execution or delivery
- privilege escalation
- injection vulnerabilities
- unsafe external-action execution
- dependency or supply-chain vulnerabilities
- AI provider or memory boundaries that expose protected operational data

## Disclosure Process

The maintainer will attempt to:

1. acknowledge a valid report within 5 business days
2. investigate and reproduce the issue
3. assess its severity and affected components
4. prepare and verify a remediation
5. coordinate disclosure when appropriate

Complex vulnerabilities may require additional time, particularly where a fix
changes authentication, persistence, migration, or deployment architecture.

Please allow a reasonable remediation period before publishing vulnerability
details.

## Security Architecture

Elara Relay follows several security invariants:

- privileged database credentials remain server-side
- browser clients do not receive direct operational database authority
- authenticated operations are owner-scoped
- durable mutations are validated and auditable
- mutation IDs and optimistic revisions protect write integrity
- meaningful operational history is append-only
- external providers are adapters rather than authorities over Elara state
- AI providers do not receive unrestricted database mutation access
- secrets must not be committed to the repository or exposed in browser bundles
- unauthenticated health responses expose only liveness, readiness, build metadata, and fixed dependency states
- structured logs use safe categories and generated request IDs; raw exception messages, tokens, credentials, and stack traces are not logged

These controls are defense-in-depth measures and should not be interpreted as a
claim that the software is free from security vulnerabilities.

## Development Status

Elara Relay is currently under active development. The privileged Node API
plane is deployment-ready and certified in-repository by
`npm run production:check`; hosting rollout and production recovery operations
remain separate operational steps.

Security assumptions that require the hosting layer — including rate limiting,
TLS termination, HSTS, and edge CSP/frame policy — remain hosting-scope items
tracked in `docs/security-follow-ups.md`.
