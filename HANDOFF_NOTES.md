# Handoff notes: adversarial-review patch exercise (2026-09-27)

For the inspecting agent. This file is session handoff, not product
documentation — it can be deleted after evaluation.

## What was asked

1. Adversarial/security review of Elara-Relay (report F1–F16, delivered in
   chat before this session's visible history — I no longer have its full
   text, only my condensed session notes).
2. "Create a PR and patch all these vulnerabilities up" (do not merge).
3. Whether a real external attacker could have compromised the app
   (answered in chat; no formal write-up committed).

## Where things stand

- Branch: `arena/01a0e11b-elara-relay` (10 commits on top of `1738f95`),
  pushed. PR #17 open, unmerged:
  https://github.com/cryogenized-spec/Elara-Relay/pull/17
- `npm run verify` passes in full (both tsc, lint, coverage, all gates,
  build). Live-Postgres suite (`test:postgres`) and Playwright e2e were NOT
  run here — no database or browsers in this sandbox; they are CI's job.
  The live-PG test file WAS updated for the new scheduler lifecycle, so
  watch CI on PR #17 for that.

## Commit map (bottom-up)

1. `522a031` F1 — total timestamp transform (`ctx.addIssue` + `z.NEVER`);
   verified first via a throwaway vitest prototype (deleted afterwards).
2. `541c4f6` F2 + F16 — pg 23505 → `DuplicateEntityError` with memory-store
   labels; `createJob` retries Job/JobKey dups ≤5 in fresh transactions.
3. `21804c4` F4 — exponential scheduler backoff + additive migration 0005
   (`consecutive_failures`); dispatcher/kernel/live-PG tests rewritten to
   the new lifecycle; `docs/scheduler-domain.md` updated.
4. `c0799b4` F8 — row mappers → value-free `StoredRecordError` (generic
   500) instead of ZodError-with-values 400.
5. `2e7c58c` F5 + F9 — reject `iat` beyond 60s skew (both auth paths);
   refuse plaintext issuers without explicit test opt-in.
6. `c227a42` F6 — `ELARA_DB_STATEMENT_TIMEOUT_MS` (default 10s, max 60s).
7. `b158fb9` F10/F12/F14 — shared auth `requestTimeoutMs`
   (`ELARA_AUTH_REQUEST_TIMEOUT_MS`, default 5s, max 30s); jose gets
   `timeoutDuration` + injected fetch via `[customFetch]`; `/user` gets
   `AbortSignal.timeout`.
8. `ba35035` F15 — 1MB streamed request-body cap → 400.
9. `c606be7` F7 — pool `error` listener (stderr note, no crash).
10. `143da7e` — `docs/security-follow-ups.md` (F3 pagination, rate
    limiting, security headers — deferred as contract/deployment scope).

## Honesty box: F-number mapping uncertainty

I reconstructed some findings from code behavior, not from the original
report text (which I could not re-read). Highest confidence: F1, F2, F4,
F5, F16. Reconstructed-but-defensible: F6 (statement timeout), F7 (pool
crash), F8 (row-value echo), F9 (plaintext issuer), F10/F12/F14
(timeouts), F15 (body cap). If the original report's F7/F9/F15 meant
something else, those real issues still needed fixing — but flag the
possible mismatch to the human rather than assuming I matched them.

## Design decisions worth scrutinizing

- **F4 backoff counter on the action, not the run.** Each retry is a new
  occurrence (new key), so per-run `attempt` resets to 1 — attempt-based
  delay alone would flatline at 5 min. True escalation needs the
  `consecutiveFailures` column (migration 0005). Operator `runAt` edits
  still override `nextRunAt`; the streak survives edits deliberately.
- **Failure preserves an operator-chosen future `nextRunAt`** when it is
  already later than the computed backoff (`max` semantics). Terminal
  actions are frozen (also protects the DB CHECK requiring null
  `next_run_at` for COMPLETED/CANCELLED).
- **409 labels use `'duplicate'` as the id**, never the conflicting value.
- **Oversize bodies return 400, not 413**, to keep the API error contract
  stable. The Content-Length pre-check was deliberately dropped: the
  header is forbidden/untestable via `app.request`, and streaming bounds
  memory regardless.
- **Build_History / milestone entries were NOT added.** That ledger
  records merged PRs with merge commits; since this PR is unmerged, the
  entry belongs at merge time (noted in the PR body).
- No `@ts-ignore`/unreasoned disables; no dependency changes; pins,
  scripts, and gate marker strings preserved (gates all pass, including
  the adversarial mutation suites, which is the strongest signal the
  security invariants survived).

## How to verify (suggested)

1. `git log --oneline main..arena/01a0e11b-elara-relay` — 10 commits.
2. `npm run verify` — the repo's full definition of done (~3 min).
3. Check PR #17 CI, especially the live-Postgres job (migration 0005 is
   exercised only there).
4. Spot-check the three rewritten lifecycle tests:
   `src/scheduler/dispatcher.test.ts`,
   `src/domain/scheduler-kernel.test.ts` (backoff tests),
   `integration/postgres-live.test.ts` (scheduler section).
5. Confirm no prod behavior regressed: `git diff main --stat` + read the
   F4 kernel diff; confirm all adversarial gates still pass (step 2 does).

## Known loose ends

- The "was it compromised?" answer lives only in chat, not in the repo.
- `docs/security-follow-ups.md` assumes F3 = pagination and names rate
  limiting + security headers as the other two deferred items; if the
  original F11/F13 differ, that file needs correcting.
- This file (`HANDOFF_NOTES.md`) should probably be removed before merge.

## Environment note (read if local history looks odd)

Between sessions the sandbox was re-provisioned: local git history showed
only `1738f95` + this handoff commit, the 4 new files from the patch
commits were present but truncated to 0 bytes, `node_modules` was gone,
and the toolchain is now node 22 (repo requires node 24, so the JS
toolchain cannot run here — `npm ci` refuses on engines, deliberately not
bypassed). Recovery: all 10 patch commits were already pushed, so the
worktree was reconciled against the remote tip — every tracked file
matched remote byte-for-byte (verified via empty `git diff`), the 4
truncated files were restored from the remote commits, and this handoff
was recommitted on top. Dependency-free gates (migration, docs, secrets,
supply-chain, verification-integrity) were re-run here and pass. The full
`npm run verify` result cited above comes from the pre-reset session on
byte-identical code; re-running it needs node 24 or CI.
