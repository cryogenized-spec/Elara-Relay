import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  isWaitingRepairStage,
  type Repair,
  type RepairStage,
  type RepairDetailsPatch,
  type RepairTestResult,
} from '../contracts/repair';
import {
  REPAIR_STAGE_TRANSITIONS,
  canRecordRepairTest,
} from '../domain/repair-policy';
import type { BrowserRuntime } from './browser-runtime';
import { runWithBearerRotationRetry } from './authorization-policy';
import {
  johannesburgIsoToLocalDateTimeInput,
  resolveLocalDateTimeEdit,
  resolveMutationAttempt,
  type PendingMutationAttempt,
} from './capture-intent';
import { OperationsApiError } from './operations-api';

const label = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
const validationMessages = z.array(z.object({ message: z.string() }));
function message(error: unknown): string {
  if (!(error instanceof Error))
    return 'The operation could not be completed. Please retry.';
  // The API may return serialized Zod issues. Present their messages, not JSON.
  try {
    const parsed = validationMessages.safeParse(
      JSON.parse(error.message) as unknown,
    );
    if (parsed.success)
      return parsed.data.map((issue) => issue.message).join('\n');
  } catch {
    /* Ordinary API/network messages are already plain text. */
  }
  return error.message;
}

type Mode = 'stage' | 'details' | 'test';

export function RepairWorkflow({
  repair,
  runtime,
  authorizationSessionId,
  onAuthorizationFailure,
  onUpdated,
  onRefresh,
}: {
  repair: Repair;
  runtime: BrowserRuntime;
  authorizationSessionId: string | null;
  onAuthorizationFailure: (
    error: unknown,
    token: string | null,
    sessionId: string | null,
  ) => boolean;
  onUpdated: (repair: Repair) => void;
  onRefresh: () => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [stage, setStage] = useState<RepairStage | ''>('');
  const [waitingOn, setWaitingOn] = useState(repair.waitingOn ?? '');
  const [followUp, setFollowUp] = useState(
    johannesburgIsoToLocalDateTimeInput(repair.followUpAt),
  );
  const [diagnosis, setDiagnosis] = useState(repair.diagnosis ?? '');
  const [finding, setFinding] = useState(repair.currentFinding ?? '');
  const [result, setResult] = useState<RepairTestResult | ''>('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const lock = useRef(false);
  const originalDetails = useRef({
    diagnosis: repair.diagnosis,
    currentFinding: repair.currentFinding,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    formRef.current
      ?.querySelector<HTMLElement>('input, select, textarea')
      ?.focus();
  }, [mode]);
  useEffect(() => {
    if (error !== null) alertRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);
  const pending = useRef<PendingMutationAttempt | null>(null);
  const stages = REPAIR_STAGE_TRANSITIONS[repair.stage];

  async function refresh() {
    const token = runtime.auth.getAccessToken();
    try {
      await onRefresh();
      setNeedsRefresh(false);
      setError(null);
      return true;
    } catch (caught: unknown) {
      if (!onAuthorizationFailure(caught, token, authorizationSessionId)) {
        setNeedsRefresh(true);
        setError(
          `Current state could not be refreshed. Your entries are retained. ${message(caught)}`,
        );
      }
      return false;
    }
  }

  async function retryRefresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function open(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    if (next === 'stage') {
      setStage('');
      setWaitingOn(repair.waitingOn ?? '');
      setFollowUp(johannesburgIsoToLocalDateTimeInput(repair.followUpAt));
    } else if (next === 'details') {
      originalDetails.current = {
        diagnosis: repair.diagnosis,
        currentFinding: repair.currentFinding,
      };
      setDiagnosis(repair.diagnosis ?? '');
      setFinding(repair.currentFinding ?? '');
    } else {
      setResult('');
      setDetail(repair.finalTestDetail ?? '');
    }
  }

  const detailsChanged =
    (diagnosis.trim() || null) !== originalDetails.current.diagnosis ||
    (finding.trim() || null) !== originalDetails.current.currentFinding;

  async function submit() {
    if (lock.current || mode === null || needsRefresh) return;
    if (mode === 'stage' && stage === '') return;
    if (mode === 'test' && result === '') return;
    if (mode === 'details' && !detailsChanged) return;
    if (
      mode === 'stage' &&
      (stage === 'CANCELLED' || stage === 'COLLECTED') &&
      !window.confirm(`${label(stage)} is terminal. Record this stage change?`)
    )
      return;

    lock.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input =
        mode === 'stage' && stage !== ''
          ? {
              stage,
              ...(isWaitingRepairStage(stage)
                ? {
                    waitingOn: waitingOn.trim() || null,
                    followUpAt: resolveLocalDateTimeEdit(
                      followUp,
                      repair.followUpAt,
                    ),
                  }
                : {}),
            }
          : null;
      const patch: RepairDetailsPatch = {};
      if ((diagnosis.trim() || null) !== originalDetails.current.diagnosis)
        patch.diagnosis = diagnosis.trim() || null;
      if ((finding.trim() || null) !== originalDetails.current.currentFinding)
        patch.currentFinding = finding.trim() || null;
      const test =
        result === ''
          ? null
          : {
              result,
              detail: detail.trim() || null,
            };
      const intent = {
        repairId: repair.id,
        expectedRevision: repair.revision,
        mode,
        values: mode === 'stage' ? input : mode === 'details' ? patch : test,
      };
      const attempt = resolveMutationAttempt(pending.current, intent);
      pending.current = attempt;
      const command = {
        mutationId: attempt.mutationId,
        expectedRevision: repair.revision,
      };
      const operation = () => {
        if (mode === 'stage' && input !== null)
          return runtime.api.moveRepairStage(repair.id, { ...command, input });
        if (mode === 'details')
          return runtime.api.updateRepairDetails(repair.id, {
            ...command,
            patch,
          });
        if (mode === 'test' && test !== null) {
          return runtime.api.recordRepairTest(repair.id, {
            ...command,
            input: test,
          });
        }
        return Promise.reject(
          new Error('Choose a stage or test result first.'),
        );
      };
      const outcome = await runWithBearerRotationRetry(
        operation,
        () => runtime.auth.getAccessToken(),
        () => runtime.auth.getSessionId(),
        authorizationSessionId,
      );
      if (!outcome.ok) {
        if (
          onAuthorizationFailure(
            outcome.error,
            outcome.requestAccessToken,
            authorizationSessionId,
          )
        )
          return;
        if (
          outcome.error instanceof OperationsApiError &&
          outcome.error.status === 409
        ) {
          // Never automatically rebase/re-submit an operator's intent.
          pending.current = null;
          setNotice(
            'Repair changed elsewhere. Review the refreshed state and your retained entries before submitting again.',
          );
          await refresh();
        } else {
          if (
            outcome.error instanceof OperationsApiError &&
            outcome.error.status === 400
          ) {
            // A concurrent stage change can be rejected before revision checking.
            await refresh();
          }
          setError(message(outcome.error));
        }
        return;
      }
      pending.current = null;
      onUpdated(outcome.value);
      setMode(null);
      setNotice('Repair saved.');
      await refresh();
    } catch (caught: unknown) {
      setError(message(caught));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      className="detailSection repairWorkflow"
      aria-label="Repair workflow"
      aria-busy={busy}
    >
      <div className="detailSection__heading">
        <h2>Repair workflow</h2>
      </div>
      <p className="repairWorkflow__testState">
        Final test:{' '}
        <strong>
          {repair.finalTestResult === null
            ? 'Not recorded'
            : label(repair.finalTestResult)}
        </strong>
        {repair.testedAt === null ? null : (
          <>
            {' '}
            ·{' '}
            {new Intl.DateTimeFormat('en-ZA', {
              timeZone: 'Africa/Johannesburg',
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(repair.testedAt))}{' '}
            SAST
          </>
        )}
      </p>
      {repair.finalTestDetail === null ? null : (
        <p className="repairWorkflow__detail">{repair.finalTestDetail}</p>
      )}
      <p className="taskMutationNotice">
        Ready and Collected require a passing final test. Entering Testing or
        reworking a Ready repair clears the previous test.
      </p>
      {notice === null ? null : (
        <p role="status" className="taskMutationNotice">
          {notice}
        </p>
      )}
      {error === null ? null : (
        <p
          id="repair-workflow-error"
          role="alert"
          ref={alertRef}
          className="captureError formError"
        >
          {error}
        </p>
      )}
      {needsRefresh ? (
        <button
          type="button"
          className="textButton"
          disabled={busy}
          onClick={() => {
            void retryRefresh();
          }}
        >
          Refresh current state
        </button>
      ) : null}
      {mode === null ? (
        <div className="taskMutationActions">
          {stages.length === 0 ? (
            <p className="taskMutationNotice">
              This Repair is terminal. No further stage changes are available.
            </p>
          ) : (
            <button
              type="button"
              className="primaryButton"
              disabled={busy || needsRefresh}
              onClick={() => open('stage')}
            >
              Change stage
            </button>
          )}
          <button
            type="button"
            className="textButton"
            disabled={busy || needsRefresh}
            onClick={() => open('details')}
          >
            Edit findings
          </button>
          {canRecordRepairTest(repair.stage) ? (
            <button
              type="button"
              className="textButton"
              disabled={busy || needsRefresh}
              onClick={() => open('test')}
            >
              Record final test
            </button>
          ) : null}
        </div>
      ) : (
        <form
          ref={formRef}
          aria-describedby={error === null ? undefined : 'repair-workflow-error'}
          className="repairWorkflow__form"
          aria-label={
            mode === 'stage'
              ? 'Change Repair stage'
              : mode === 'test'
                ? 'Record final test'
                : 'Edit Repair findings'
          }
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {mode === 'stage' ? (
            <>
              <label className="formField">
                <span>Next stage</span>
                <select
                  value={stage}
                  disabled={busy}
                  required
                  onChange={(event) =>
                    setStage(event.target.value as RepairStage)
                  }
                >
                  <option value="">Choose a stage</option>
                  {stage !== '' && !stages.includes(stage) ? (
                    <option value={stage}>
                      {label(stage)} — no longer available
                    </option>
                  ) : null}
                  {stages.map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              {stage !== '' && isWaitingRepairStage(stage) ? (
                <>
                  <label className="formField">
                    <span>Waiting on</span>
                    <input
                      value={waitingOn}
                      onChange={(event) => setWaitingOn(event.target.value)}
                      disabled={busy}
                      required
                      maxLength={240}
                    />
                  </label>
                  <label className="formField">
                    <span>Follow-up (Africa/Johannesburg)</span>
                    <input
                      type="datetime-local"
                      value={followUp}
                      onChange={(event) => setFollowUp(event.target.value)}
                      disabled={busy}
                      required
                    />
                  </label>
                </>
              ) : null}
              <p className="taskMutationNotice">
                The server validates this transition. Leaving a waiting stage
                clears its waiting reason and follow-up.
              </p>
            </>
          ) : mode === 'details' ? (
            <>
              <div className="formField">
                <label htmlFor="repair-diagnosis">Diagnosis</label>
                <textarea
                  id="repair-diagnosis"
                  value={diagnosis}
                  onChange={(event) => setDiagnosis(event.target.value)}
                  disabled={busy}
                  maxLength={4000}
                  rows={3}
                />
              </div>
              <div className="formField">
                <label htmlFor="repair-finding">Current finding</label>
                <textarea
                  id="repair-finding"
                  value={finding}
                  onChange={(event) => setFinding(event.target.value)}
                  disabled={busy}
                  maxLength={4000}
                  rows={3}
                />
              </div>
            </>
          ) : (
            <>
              <label className="formField">
                <span>Final-test result</span>
                <select
                  value={result}
                  onChange={(event) =>
                    setResult(event.target.value as RepairTestResult)
                  }
                  required
                  disabled={busy}
                >
                  <option value="">Choose a result</option>
                  <option value="PASS">Pass</option>
                  <option value="FAIL">Fail</option>
                </select>
              </label>
              <div className="formField">
                <label htmlFor="repair-test-detail">Test detail</label>
                <textarea
                  id="repair-test-detail"
                  value={detail}
                  onChange={(event) => setDetail(event.target.value)}
                  disabled={busy}
                  maxLength={4000}
                  rows={3}
                />
              </div>
              <p className="taskMutationNotice">
                Record the observed result. Saving a test does not change the
                Repair stage.
              </p>
            </>
          )}
          <div className="taskMutationActions">
            <button
              className="primaryButton"
              type="submit"
              disabled={
                busy || needsRefresh || (mode === 'details' && !detailsChanged)
              }
            >
              {busy
                ? 'Saving…'
                : mode === 'stage'
                  ? 'Save stage'
                  : mode === 'test'
                    ? 'Save final test'
                    : 'Save findings'}
            </button>
            <button
              className="textButton"
              type="button"
              disabled={busy}
              onClick={() => {
                setMode(null);
                setError(null);
              }}
            >
              Discard edits
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
