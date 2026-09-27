# Repair workflow UI — verification record

## Scope and authority

Base main: `482dd98fa587b6f3f67302fca70cc5c36f9ff6b8` (fetched before implementation).

The signed-in Repair detail now supports progression, waiting context,
diagnosis/current findings, final tests, Ready/Collected and cancellation.
The existing API, kernel, contracts, PostgreSQL adapter and mutation receipt
semantics remain authoritative. There are no new endpoints, migrations,
providers or browser persistence stores.

`repair-policy.ts` is the kernel's original transition table extracted unchanged,
not a UI state machine. The collected-reopening adversarial gate now mutates
that file and runs the same domain test. Repair refresh extends the existing
workspace loader with a surface-preserving mode; it does not add a second
read model or auth lifecycle.

## Automated coverage

- Browser API tests cover versioned envelopes, server-owned actors, strict
  success validation, invalid operations, conflicts and replay receipts.
- Playwright Repair tests route requests through the real Hono API and domain
  kernel with the memory adapter. Only authentication infrastructure and fault
  injection are harnessed. They do not duplicate transition rules.
- Browser cases cover both waiting branches, follow-up timezone conversion,
  waiting-field clearing, findings, incomplete/failed final-test rejection,
  retesting, Ready rework, collection/cancellation, terminal controls,
  concurrent updates, retained drafts, failed refresh, lost success responses
  and unchanged mutation-ID retries.
- PostgreSQL tests cover persisted failed-test enforcement, stale revisions,
  replay, terminal collection, append-only test Events and a fresh-kernel read.
- Existing auth, migration, domain, dependency and adversarial gates remain
  enabled. No certification threshold, test, or CI job was removed or weakened.

## Local results

Toolchain: Node 24.21.0, npm 11.19.0; repository lockfile unchanged.

- `npm run verify`: 264 tests in 39 files; TypeScript 6 and 7, lint, coverage,
  security/auth/docs/supply-chain gates, adversarial gates, schema and build.
- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/elara?sslmode=disable npm run test:postgres`:
  **4 tests passed**, against disposable local PostgreSQL 18.4. No remote
  database was accessed. A pre-existing pg concurrent-query deprecation warning
  remains; no test failures.
- Supplemental full Playwright run: **66 tests passed**, including 24 new Repair
  cases (8 per project) and the existing foundation tests. Screenshot comparison
  ran without `--update-snapshots` for the final full regression pass.
- Viewports: desktop Chromium 1280×720; exact 9:16 405×720; Android portrait
  emulation 412×915. This is device emulation, not physical Android hardware.

### Pinned-browser certification limitation

The sandbox could not download Playwright's pinned Chrome for Testing
153.0.8010.12 (revision 1243): CDN/storage TLS connections failed. Debian package
mirrors were also unreachable. The standard pinned-browser Playwright command
therefore cannot launch locally. This is **not** recorded as a pinned-browser
pass; the unchanged CI browser gate must run before merge.

For additional verification, Chromium **153.0.8010.0** from the out-of-repository
`@sparticuz/chromium@153.0.0` package was used with Playwright 1.63.0. An external
config imported the checked-in config, retained all three projects, assertions,
traces, screenshot comparisons and zero retries, and supplied the alternate
executable and its launch arguments. Video was disabled in that supplemental
run because the standard browser/FFmpeg downloads were unavailable. No fallback
config, binary or test-tool dependency was added to the repository.

The first sandbox baselines used that alternate build. They were replaced after
reviewing official pinned-browser captures; do not regenerate them from a
substitute Chromium. The existing production bundle size warning also remains.

## GitHub certification follow-up

Pinned Playwright failed only the four Repair screenshot comparisons on every
viewport. All other Playwright cases, PostgreSQL, TypeScript, adversarial and
build gates passed. The mismatches were 119–320 pixels (about 1% of each
image): the same layout, copy and hierarchy, with different text rasterization
between the sandbox Chromium 153.0.8010.0 used to generate the first baselines
and official Chrome for Testing 153.0.8010.12.

The twelve Repair snapshots were replaced with lossless rasters reconstructed
from that official CI browser. Screenshot assertions, retries, viewports and
maxDiffPixels remain unchanged. The visual test now also asserts browser
version `153.0.8010.12` so a substitute Chromium cannot silently recertify
these images.

## Visual evidence

Before (read-only Repair detail at base main):

- [405×720](visual/repair-ui/repair-before-mobile-9x16.png)
- [412×915](visual/repair-ui/repair-before-android-portrait.png)
- [1280×720](visual/repair-ui/repair-before-chromium.png)

After/regression baselines live in
[`e2e/repair-workflow.spec.ts-snapshots/`](../e2e/repair-workflow.spec.ts-snapshots/):
Repair overview, waiting form, final-test form and blocked Ready state at every
required viewport. The before fixture is the existing waiting Repair; after
fixtures start with a deterministic Received Repair and progress through the
real kernel. Screenshots are UI evidence, not production data.

Inspected: one-column forms, restrained dark styling, inline readable validation,
44px input/button targets, horizontal overflow, wrapping and scroll reachability.
Forms stay inside the existing modal scroll flow; the modal excludes the underlying
bottom navigation. No Lucide, gradients, hero region or card grid was introduced.

## Intentionally unchanged/deferred

- Waiting-stage self-transitions/in-place waiting edits remain unsupported by
  the existing domain; no UI-only workaround or new lifecycle was introduced.
- No serial/storage editing expansion, production deployment, PWA work,
  backup/restore, AI work or outbound actions.
- Explicit human merge approval is still required. This change does not
  authorize a merge.
