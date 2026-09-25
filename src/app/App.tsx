import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import addCircleBold from '@iconify-icons/solar/add-circle-bold';
import altArrowLeftLinear from '@iconify-icons/solar/alt-arrow-left-linear';
import altArrowRightLinear from '@iconify-icons/solar/alt-arrow-right-linear';
import calendarLinear from '@iconify-icons/solar/calendar-linear';
import caseRoundLinear from '@iconify-icons/solar/case-round-linear';
import clipboardListLinear from '@iconify-icons/solar/clipboard-list-linear';
import home2Linear from '@iconify-icons/solar/home-2-linear';
import magniferLinear from '@iconify-icons/solar/magnifer-linear';
import settingsLinear from '@iconify-icons/solar/settings-linear';
import type { AuthIdentity } from '../auth/auth-verifier';
import type {
  JobViewPayload,
  RepairViewPayload,
  RepairsResultPayload,
  ScheduleResultPayload,
  TaskViewPayload,
  TodayResultPayload,
  WorkResultPayload,
} from '../contracts/read-model';
import type { BrowserRuntime } from './browser-runtime';
import { OperationsApiError } from './operations-api';
import {
  buildRepairsView,
  buildScheduleView,
  buildSearchGroups,
  buildTodayView,
  buildWorkView,
  type SearchGroupViewModel,
  type ScheduleViewModel,
  type TodayViewModel,
  type UiRow,
  type WorkViewModel,
  type RepairsViewModel,
} from './read-view-model';

type ViewId = 'today' | 'work' | 'repairs' | 'schedule';
type Tone = 'danger' | 'attention' | 'success' | 'info' | 'neutral';
type CaptureMode = 'menu' | 'task' | 'repair' | 'reminder';

interface WorkRow {
  id: string;
  eyebrow: string;
  title: string;
  meta: string;
  badge: string;
  tone: Tone;
}

interface SearchPreviewRow {
  id: string;
  eyebrow: string;
  title: string;
  meta: string;
}

interface SearchPreviewGroup {
  label: string;
  rows: SearchPreviewRow[];
}

const navItems = [
  { id: 'today' as const, label: 'Today', icon: home2Linear },
  { id: 'work' as const, label: 'Work', icon: caseRoundLinear },
  { id: 'repairs' as const, label: 'Repairs', icon: settingsLinear },
  { id: 'schedule' as const, label: 'Schedule', icon: calendarLinear },
];

const viewContext: Record<ViewId, { title: string; meta: string }> = {
  today: { title: 'Today', meta: workingDate() },
  work: { title: 'Work', meta: 'Jobs & tasks' },
  repairs: { title: 'Repairs', meta: 'Workshop' },
  schedule: { title: 'Schedule', meta: 'Africa/Johannesburg' },
};

const attentionRows: WorkRow[] = [
  {
    id: 'repair-follow-up',
    eyebrow: 'REPAIR · JOB-7A31C4F2',
    title: 'Avenge X regulator — supplier follow-up',
    meta: 'Waiting on transfer seal kit · follow-up overdue 42m',
    badge: 'Waiting',
    tone: 'attention',
  },
  {
    id: 'task-overdue',
    eyebrow: 'TASK · INVENTORY',
    title: 'Confirm incoming PCP seal stock',
    meta: 'Due 08:30 · high priority',
    badge: 'Overdue',
    tone: 'danger',
  },
];

const readyRows: WorkRow[] = [
  {
    id: 'repair-ready',
    eyebrow: 'REPAIR · JOB-18E92B11',
    title: 'Baredda S56 — final check complete',
    meta: 'Final test passed · ready for collection',
    badge: 'Ready',
    tone: 'success',
  },
];

const nextRows: WorkRow[] = [
  {
    id: 'task-next',
    eyebrow: 'TASK · WEBSITE',
    title: 'Review product description queue',
    meta: 'Today · 11:00',
    badge: 'Next',
    tone: 'info',
  },
  {
    id: 'schedule-next',
    eyebrow: 'REMINDER · 14:00',
    title: 'Check supplier ETA',
    meta: 'Linked to regulator repair',
    badge: 'Scheduled',
    tone: 'neutral',
  },
];

const jobRows: WorkRow[] = [
  {
    id: 'job-regulator',
    eyebrow: 'JOB-7A31C4F2 · WORKSHOP',
    title: 'Avenge X regulator repair',
    meta: 'Demo workshop customer · linked Repair waiting on parts',
    badge: 'Waiting',
    tone: 'attention',
  },
  {
    id: 'job-website',
    eyebrow: 'JOB-42D117A0 · INTERNAL',
    title: 'Website product cleanup',
    meta: '2 open Tasks · updated today 09:10',
    badge: 'Active',
    tone: 'info',
  },
];

const taskRows: WorkRow[] = [
  {
    id: 'task-inbox',
    eyebrow: 'TASK · INBOX',
    title: 'Inspect returned CO₂ pistol',
    meta: 'No due date · captured 08:12',
    badge: 'Inbox',
    tone: 'neutral',
  },
  {
    id: 'task-next',
    eyebrow: 'TASK · JOB-42D117A0',
    title: 'Review product description queue',
    meta: 'Today · 11:00',
    badge: 'Next',
    tone: 'info',
  },
  {
    id: 'task-doing',
    eyebrow: 'TASK · JOB-7A31C4F2',
    title: 'Pressure-test regulator block',
    meta: 'Started 09:04 · high priority',
    badge: 'Doing',
    tone: 'info',
  },
  {
    id: 'task-waiting',
    eyebrow: 'TASK · JOB-7A31C4F2',
    title: 'Confirm supplier part availability',
    meta: 'Waiting on supplier response · follow-up today 14:00',
    badge: 'Waiting',
    tone: 'attention',
  },
];

const repairGroups = [
  {
    label: 'Testing',
    rows: [
      {
        id: 'repair-testing',
        eyebrow: 'JOB-6B6A9D10 · PCP',
        title: 'Regulator rebuild',
        meta: 'Testing · serial AVX-240924',
        badge: 'Testing',
        tone: 'info' as const,
      },
    ],
  },
  { label: 'Waiting', rows: attentionRows.slice(0, 1) },
  { label: 'Ready for collection', rows: readyRows },
];

const scheduleRows: WorkRow[] = [
  {
    id: 'schedule-due',
    eyebrow: 'REMINDER · 09:30',
    title: 'Follow up seal supplier',
    meta: 'One-time · linked repair JOB-7A31C4F2',
    badge: 'Due',
    tone: 'attention',
  },
  {
    id: 'schedule-upcoming',
    eyebrow: 'DIGEST · 16:30',
    title: 'Daily operations digest',
    meta: 'Every day · owner only',
    badge: 'Recurring',
    tone: 'info',
  },
  {
    id: 'schedule-paused',
    eyebrow: 'REMINDER · MON 08:00',
    title: 'Website backlog review',
    meta: 'Every week · paused',
    badge: 'Paused',
    tone: 'neutral',
  },
];

const captureChoices: Array<{
  mode: Exclude<CaptureMode, 'menu'>;
  label: string;
  description: string;
  icon: typeof clipboardListLinear;
}> = [
  {
    mode: 'task',
    label: 'Task',
    description: 'Capture a concrete next action',
    icon: clipboardListLinear,
  },
  {
    mode: 'repair',
    label: 'Repair / Job',
    description: 'Open workshop work with a durable timeline',
    icon: settingsLinear,
  },
  {
    mode: 'reminder',
    label: 'Reminder',
    description: 'Schedule a one-time or recurring action',
    icon: calendarLinear,
  },
];

const captureTitles: Record<CaptureMode, string> = {
  menu: 'Capture',
  task: 'New task',
  repair: 'New repair / Job',
  reminder: 'New reminder',
};

const searchPreviewGroups: SearchPreviewGroup[] = [
  {
    label: 'Repairs',
    rows: [
      {
        id: 'search-repair-avenge',
        eyebrow: 'REPAIR · JOB-7A31C4F2',
        title: 'Avenge X regulator',
        meta: 'Waiting on transfer seal kit · serial AVX-240924',
      },
    ],
  },
  {
    label: 'Jobs',
    rows: [
      {
        id: 'search-job-baredda',
        eyebrow: 'JOB-18E92B11 · WORKSHOP',
        title: 'Baredda S56 final check',
        meta: 'Final test passed · ready for collection',
      },
    ],
  },
  {
    label: 'Tasks',
    rows: [
      {
        id: 'search-task-stock',
        eyebrow: 'TASK · INVENTORY',
        title: 'Confirm incoming PCP seal stock',
        meta: 'Due today 08:30 · high priority',
      },
    ],
  },
  {
    label: 'Schedule',
    rows: [
      {
        id: 'search-schedule-supplier',
        eyebrow: 'REMINDER · 14:00',
        title: 'Check supplier ETA',
        meta: 'One time · linked to JOB-7A31C4F2',
      },
    ],
  },
  {
    label: 'Parties',
    rows: [
      {
        id: 'search-party-customer',
        eyebrow: 'CUSTOMER',
        title: 'Demo workshop customer',
        meta: 'Linked to one active Repair',
      },
    ],
  },
];

function workingDate(): string {
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date());
}

function sectionId(title: string): string {
  return `section-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

function StatusBadge({ tone, children }: { tone: Tone; children: string }) {
  return <span className={`statusBadge statusBadge--${tone}`}>{children}</span>;
}

function Row({
  row,
  onActivate,
}: {
  row: WorkRow;
  onActivate?: (() => void) | undefined;
}) {
  const body = (
    <>
      <span className="workRow__body">
        <span className="workRow__eyebrow">{row.eyebrow}</span>
        <span className="workRow__title">{row.title}</span>
        <span className="workRow__meta">{row.meta}</span>
      </span>
      <span className="workRow__aside">
        <StatusBadge tone={row.tone}>{row.badge}</StatusBadge>
        {onActivate === undefined ? null : (
          <Icon icon={altArrowRightLinear} width={18} aria-hidden="true" />
        )}
      </span>
    </>
  );

  if (onActivate === undefined) {
    return <div className="workRow workRow--static">{body}</div>;
  }

  return (
    <button
      className="workRow"
      type="button"
      onClick={onActivate}
      aria-label={`Open ${row.title}`}
    >
      {body}
    </button>
  );
}

function Section<T extends WorkRow>({
  title,
  count,
  rows,
  onActivateRow,
  emptyLabel = 'Nothing here',
}: {
  title: string;
  count: number;
  rows: T[];
  onActivateRow?: ((row: T) => void) | undefined;
  emptyLabel?: string;
}) {
  const id = sectionId(title);

  return (
    <section className="sectionBlock" aria-labelledby={id}>
      <div className="sectionHeading">
        <h2 id={id}>{title}</h2>
        <span aria-label={`${count} items`}>{count}</span>
      </div>
      <div className="rowList">
        {rows.length === 0 ? (
          <p className="emptyRow">{emptyLabel}</p>
        ) : (
          rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              onActivate={
                onActivateRow === undefined
                  ? undefined
                  : () => onActivateRow(row)
              }
            />
          ))
        )}
      </div>
    </section>
  );
}

function TodayView({
  onOpenRepair,
}: {
  onOpenRepair: () => void;
}) {
  return (
    <>
      <section className="attentionSummary" aria-label="Today attention summary">
        <div>
          <strong className="summaryValue summaryValue--danger">1</strong>
          <span>Overdue</span>
        </div>
        <div>
          <strong>3</strong>
          <span>Today</span>
        </div>
        <div>
          <strong className="summaryValue summaryValue--attention">2</strong>
          <span>Waiting</span>
        </div>
        <div>
          <strong className="summaryValue summaryValue--success">1</strong>
          <span>Ready</span>
        </div>
      </section>

      <Section
        title="Needs attention"
        count={2}
        rows={attentionRows}
        onActivateRow={(row) => {
          if (row.id === 'repair-follow-up') onOpenRepair();
        }}
      />
      <Section title="Ready for collection" count={1} rows={readyRows} />
      <Section title="Next" count={2} rows={nextRows} />
    </>
  );
}

function WorkView({
  onOpenJob,
  onOpenTask,
}: {
  onOpenJob: () => void;
  onOpenTask: () => void;
}) {
  return (
    <>
      <Section
        title="Jobs"
        count={jobRows.length}
        rows={jobRows}
        onActivateRow={(row) => {
          if (row.id === 'job-regulator') onOpenJob();
        }}
      />
      <Section
        title="Tasks"
        count={taskRows.length}
        rows={taskRows}
        onActivateRow={(row) => {
          if (row.id === 'task-doing') onOpenTask();
        }}
      />
    </>
  );
}

function RepairsView({
  onOpenRepair,
}: {
  onOpenRepair: () => void;
}) {
  return (
    <>
      {repairGroups.map((group) => (
        <Section
          key={group.label}
          title={group.label}
          count={group.rows.length}
          rows={group.rows}
          onActivateRow={(row) => {
            if (row.id === 'repair-follow-up') onOpenRepair();
          }}
        />
      ))}
    </>
  );
}

function ScheduleView() {
  return (
    <Section
      title="Due & upcoming"
      count={scheduleRows.length}
      rows={scheduleRows}
    />
  );
}

function SearchSurface({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    dialog.showModal();
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      previousFocus?.focus();
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const groups =
    normalizedQuery === ''
      ? []
      : searchPreviewGroups
          .map((group) => ({
            ...group,
            rows: group.rows.filter((row) =>
              `${row.eyebrow} ${row.title} ${row.meta}`
                .toLowerCase()
                .includes(normalizedQuery),
            ),
          }))
          .filter((group) => group.rows.length > 0);
  const resultCount = groups.reduce(
    (count, group) => count + group.rows.length,
    0,
  );

  return (
    <dialog
      className="overlaySurface"
      ref={dialogRef}
      aria-label="Search"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="overlayHeader">
        <div>
          <h1>Search</h1>
          <p>Jobs, repairs, tasks and history</p>
        </div>
        <button className="textButton" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <label className="searchField">
        <Icon icon={magniferLinear} width={20} aria-hidden="true" />
        <span className="srOnly">Search Elara</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setGroups([]);
            setError(null);
            setState(nextQuery.trim().length < 2 ? 'idle' : 'loading');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
          placeholder="Job, serial, task, customer…"
          type="search"
        />
      </label>

      {normalizedQuery === '' ? (
        <div className="searchHint">
          <Icon icon={magniferLinear} width={20} aria-hidden="true" />
          <span>
            Search customers, Job keys, repair serials, faults, schedules and
            event detail.
          </span>
        </div>
      ) : (
        <div className="searchResults" aria-label="Preview search results">
          <div className="searchResultSummary" role="status">
            <span>Preview results</span>
            <strong>{resultCount}</strong>
          </div>

          {resultCount === 0 ? (
            <div className="searchNoResults">
              <strong>No preview results</strong>
              <span>
                Live operational search will replace these fixtures when the API
                is wired.
              </span>
            </div>
          ) : (
            groups.map((group) => (
              <section
                className="searchResultGroup"
                key={group.label}
                aria-labelledby={`search-group-${group.label.toLowerCase()}`}
              >
                <div className="searchGroupHeading">
                  <h2 id={`search-group-${group.label.toLowerCase()}`}>
                    {group.label}
                  </h2>
                  <span>{group.rows.length}</span>
                </div>
                <div className="searchResultList">
                  {group.rows.map((row) => (
                    <div className="searchResultRow" key={row.id}>
                      <span className="searchResultRow__eyebrow">
                        {row.eyebrow}
                      </span>
                      <strong>{row.title}</strong>
                      <span>{row.meta}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </dialog>
  );
}
function TaskDetailSurface({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    dialog.showModal();
    document.body.style.overflow = 'hidden';
    titleRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      previousFocus?.focus();
    };
  }, []);

  return (
    <dialog
      className="overlaySurface detailSurface"
      ref={dialogRef}
      aria-labelledby="task-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="detailTopBar">
        <button className="detailBackButton" type="button" onClick={onClose}>
          <Icon icon={altArrowLeftLinear} width={20} aria-hidden="true" />
          <span>Back</span>
        </button>
        <span className="previewState" role="status">
          <span aria-hidden="true" />
          Preview
        </span>
      </div>

      <section className="repairSummary" aria-labelledby="task-detail-title">
        <span className="repairSummary__key">TASK · JOB-7A31C4F2</span>
        <div className="repairSummary__titleRow">
          <div>
            <h1 id="task-detail-title" ref={titleRef} tabIndex={-1}>
              Pressure-test regulator block
            </h1>
            <p>Linked to Avenge X regulator repair</p>
          </div>
          <StatusBadge tone="info">Doing</StatusBadge>
        </div>
        <p className="repairSummary__reason">
          High priority · started today 09:04
        </p>
      </section>

      <div className="detailActionBar" aria-label="Task actions">
        <button type="button" disabled>
          Update Task
        </button>
        <button type="button" disabled>
          Mark waiting
        </button>
        <span>Preview only</span>
      </div>

      <section className="detailSection" aria-labelledby="task-current-state">
        <div className="detailSection__heading">
          <h2 id="task-current-state">Current state</h2>
        </div>
        <dl className="detailFields">
          <div>
            <dt>Status</dt>
            <dd>Doing</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>High</dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>Today · 12:00</dd>
          </div>
          <div>
            <dt>Follow-up</dt>
            <dd>None</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>Today · 08:42</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>Today · 09:04</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd className="detailValue--mono">3</dd>
          </div>
        </dl>
      </section>

      <section className="detailSection" aria-labelledby="task-linked-job">
        <div className="detailSection__heading">
          <h2 id="task-linked-job">Linked Job</h2>
        </div>
        <div className="detailCompactRows">
          <div>
            <span>
              <strong>Avenge X regulator repair</strong>
              <small>JOB-7A31C4F2 · Demo workshop customer</small>
            </span>
            <StatusBadge tone="attention">Waiting</StatusBadge>
          </div>
        </div>
      </section>

      <section className="detailSection detailTimeline" aria-labelledby="task-timeline">
        <div className="detailSection__heading">
          <h2 id="task-timeline">Timeline</h2>
        </div>
        <ol>
          <li>
            <span className="detailTimeline__time">09:04</span>
            <div>
              <strong>Task started</strong>
              <p>Status changed from Next to Doing</p>
            </div>
          </li>
          <li>
            <span className="detailTimeline__time">08:51</span>
            <div>
              <strong>Priority set to High</strong>
              <p>Due today at 12:00</p>
            </div>
          </li>
          <li>
            <span className="detailTimeline__time">08:42</span>
            <div>
              <strong>Task created</strong>
              <p>Linked to JOB-7A31C4F2</p>
            </div>
          </li>
        </ol>
      </section>
    </dialog>
  );
}

function JobDetailSurface({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    dialog.showModal();
    document.body.style.overflow = 'hidden';
    titleRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      previousFocus?.focus();
    };
  }, []);

  return (
    <dialog
      className="overlaySurface detailSurface"
      ref={dialogRef}
      aria-labelledby="job-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="detailTopBar">
        <button className="detailBackButton" type="button" onClick={onClose}>
          <Icon icon={altArrowLeftLinear} width={20} aria-hidden="true" />
          <span>Back</span>
        </button>
        <span className="previewState" role="status">
          <span aria-hidden="true" />
          Preview
        </span>
      </div>

      <section className="repairSummary" aria-labelledby="job-detail-title">
        <span className="repairSummary__key">JOB-7A31C4F2 · WORKSHOP</span>
        <div className="repairSummary__titleRow">
          <div>
            <h1 id="job-detail-title" ref={titleRef} tabIndex={-1}>
              Avenge X regulator repair
            </h1>
            <p>Demo workshop customer</p>
          </div>
          <StatusBadge tone="attention">Waiting</StatusBadge>
        </div>
        <p className="repairSummary__reason">
          Durable case · linked Repair is awaiting parts
        </p>
      </section>

      <div className="detailActionBar" aria-label="Job actions">
        <button type="button" disabled>
          Update Job
        </button>
        <button type="button" disabled>
          Add Task
        </button>
        <span>Preview only</span>
      </div>

      <section className="detailSection" aria-labelledby="job-current-state">
        <div className="detailSection__heading">
          <h2 id="job-current-state">Current state</h2>
        </div>
        <dl className="detailFields">
          <div>
            <dt>Category</dt>
            <dd>Waiting</dd>
          </div>
          <div>
            <dt>Party</dt>
            <dd>Demo workshop customer</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>Today · 08:20</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>Today · 09:18</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd className="detailValue--mono">6</dd>
          </div>
        </dl>
      </section>

      <section className="detailSection" aria-labelledby="job-linked-repair">
        <div className="detailSection__heading">
          <h2 id="job-linked-repair">Linked Repair</h2>
          <span>1</span>
        </div>
        <div className="detailCompactRows">
          <div>
            <span>
              <strong>Avenge X regulator</strong>
              <small>Awaiting parts · serial AVX-240924</small>
            </span>
            <StatusBadge tone="attention">Waiting</StatusBadge>
          </div>
        </div>
      </section>

      <section className="detailSection" aria-labelledby="job-linked-tasks">
        <div className="detailSection__heading">
          <h2 id="job-linked-tasks">Tasks</h2>
          <span>2</span>
        </div>
        <div className="detailCompactRows">
          <div>
            <span>
              <strong>Pressure-test regulator block</strong>
              <small>Started 09:04 · high priority</small>
            </span>
            <StatusBadge tone="info">Doing</StatusBadge>
          </div>
          <div>
            <span>
              <strong>Confirm supplier part availability</strong>
              <small>Waiting on supplier · follow-up 14:00</small>
            </span>
            <StatusBadge tone="attention">Waiting</StatusBadge>
          </div>
        </div>
      </section>

      <section className="detailSection" aria-labelledby="job-schedule">
        <div className="detailSection__heading">
          <h2 id="job-schedule">Scheduled actions</h2>
          <span>1</span>
        </div>
        <div className="detailCompactRows">
          <div>
            <span>
              <strong>Check supplier ETA</strong>
              <small>Today · 14:00 · one time</small>
            </span>
            <StatusBadge tone="neutral">Scheduled</StatusBadge>
          </div>
        </div>
      </section>

      <section className="detailSection detailTimeline" aria-labelledby="job-timeline">
        <div className="detailSection__heading">
          <h2 id="job-timeline">Timeline</h2>
        </div>
        <ol>
          <li>
            <span className="detailTimeline__time">09:18</span>
            <div>
              <strong>Job moved to Waiting</strong>
              <p>Linked Repair is awaiting a supplier part</p>
            </div>
          </li>
          <li>
            <span className="detailTimeline__time">09:04</span>
            <div>
              <strong>Task started</strong>
              <p>Pressure-test regulator block</p>
            </div>
          </li>
          <li>
            <span className="detailTimeline__time">08:20</span>
            <div>
              <strong>Job created</strong>
              <p>Workshop repair opened for Demo workshop customer</p>
            </div>
          </li>
        </ol>
      </section>
    </dialog>
  );
}

function RepairDetailSurface({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    dialog.showModal();
    document.body.style.overflow = 'hidden';
    titleRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      previousFocus?.focus();
    };
  }, []);

  return (
    <dialog
      className="overlaySurface detailSurface"
      ref={dialogRef}
      aria-labelledby="repair-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="detailTopBar">
        <button className="detailBackButton" type="button" onClick={onClose}>
          <Icon icon={altArrowLeftLinear} width={20} aria-hidden="true" />
          <span>Back</span>
        </button>
        <span className="previewState" role="status">
          <span aria-hidden="true" />
          Preview
        </span>
      </div>

      <section className="repairSummary" aria-labelledby="repair-detail-title">
        <span className="repairSummary__key">JOB-7A31C4F2 · REPAIR</span>
        <div className="repairSummary__titleRow">
          <div>
            <h1 id="repair-detail-title" ref={titleRef} tabIndex={-1}>
              Avenge X regulator
            </h1>
            <p>Demo workshop customer · PCP</p>
          </div>
          <StatusBadge tone="attention">Waiting</StatusBadge>
        </div>
        <p className="repairSummary__reason">
          Awaiting transfer seal kit from supplier
        </p>
      </section>

      <div className="detailActionBar" aria-label="Repair actions">
        <button type="button" disabled>
          Progress stage
        </button>
        <button type="button" disabled>
          Record test
        </button>
        <span>Preview only</span>
      </div>

      <section className="detailSection" aria-labelledby="repair-current-state">
        <div className="detailSection__heading">
          <h2 id="repair-current-state">Current state</h2>
        </div>
        <dl className="detailFields">
          <div>
            <dt>Stage</dt>
            <dd>Awaiting parts</dd>
          </div>
          <div>
            <dt>Follow-up</dt>
            <dd className="detailValue--attention">Overdue 42m</dd>
          </div>
          <div>
            <dt>Reported fault</dt>
            <dd>Pressure drops after refill</dd>
          </div>
          <div>
            <dt>Current finding</dt>
            <dd>Regulator transfer seal leaking under pressure</dd>
          </div>
          <div>
            <dt>Serial</dt>
            <dd className="detailValue--mono">AVX-240924</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>Workshop · regulator tray</dd>
          </div>
        </dl>
      </section>

      <section className="detailSection" aria-labelledby="repair-linked-tasks">
        <div className="detailSection__heading">
          <h2 id="repair-linked-tasks">Linked tasks</h2>
          <span>1</span>
        </div>
        <div className="detailCompactRows">
          <div>
            <span>
              <strong>Pressure-test regulator block</strong>
              <small>Started 09:04 · high priority</small>
            </span>
            <StatusBadge tone="info">Doing</StatusBadge>
          </div>
        </div>
      </section>

      <section className="detailSection" aria-labelledby="repair-schedule">
        <div className="detailSection__heading">
          <h2 id="repair-schedule">Scheduled actions</h2>
          <span>1</span>
        </div>
        <div className="detailCompactRows">
          <div>
            <span>
              <strong>Check supplier ETA</strong>
              <small>Today · 14:00 · one time</small>
            </span>
            <StatusBadge tone="neutral">Scheduled</StatusBadge>
          </div>
        </div>
      </section>

      <section className="detailSection detailTimeline" aria-labelledby="repair-timeline">
        <div className="detailSection__heading">
          <h2 id="repair-timeline">Timeline</h2>
        </div>
        <ol>
          <li>
            <span className="detailTimeline__time">09:18</span>
            <div>
              <strong>Stage changed to Awaiting Parts</strong>
              <p>Waiting on transfer seal kit · follow-up set</p>
            </div>
          </li>
          <li>
            <span className="detailTimeline__time">08:54</span>
            <div>
              <strong>Finding updated</strong>
              <p>Regulator transfer seal leaking under pressure</p>
            </div>
          </li>
          <li>
            <span className="detailTimeline__time">08:21</span>
            <div>
              <strong>Repair received</strong>
              <p>Reported pressure loss after refill</p>
            </div>
          </li>
        </ol>
      </section>
    </dialog>
  );
}

function TaskCaptureForm() {
  return (
    <form className="captureForm" aria-describedby="capture-preview-note">
      <label className="formField">
        <span>Title</span>
        <input name="task-title" placeholder="What needs doing?" required />
      </label>
      <label className="formField">
        <span>Due</span>
        <input name="task-due" type="datetime-local" />
      </label>
      <label className="formField">
        <span>Linked Job</span>
        <input name="task-job" placeholder="Optional Job key" />
      </label>
      <PreviewSave />
    </form>
  );
}

function RepairCaptureForm() {
  return (
    <form className="captureForm" aria-describedby="capture-preview-note">
      <label className="formField">
        <span>Customer</span>
        <input name="repair-customer" placeholder="Customer or Party" required />
      </label>
      <label className="formField">
        <span>Item / model</span>
        <input name="repair-item" placeholder="What is being repaired?" required />
      </label>
      <label className="formField">
        <span>Reported fault</span>
        <textarea
          name="repair-fault"
          placeholder="Describe the reported problem"
          required
        />
      </label>
      <label className="formField">
        <span>Serial</span>
        <input name="repair-serial" placeholder="Optional serial number" />
      </label>
      <PreviewSave />
    </form>
  );
}

function ReminderCaptureForm() {
  return (
    <form className="captureForm" aria-describedby="capture-preview-note">
      <label className="formField">
        <span>Title</span>
        <input name="reminder-title" placeholder="What should happen?" required />
      </label>
      <label className="formField">
        <span>Run at</span>
        <input name="reminder-run-at" type="datetime-local" required />
      </label>
      <label className="formField">
        <span>Repeat</span>
        <select name="reminder-repeat" defaultValue="once">
          <option value="once">One time</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
      <label className="formField">
        <span>Linked Job</span>
        <input name="reminder-job" placeholder="Optional Job key" />
      </label>
      <PreviewSave />
    </form>
  );
}

function PreviewSave() {
  return (
    <div className="captureForm__footer">
      <p id="capture-preview-note">
        Preview only — nothing entered here is persisted yet.
      </p>
      <button className="previewSaveButton" type="button" disabled>
        Save unavailable in preview
      </button>
    </div>
  );
}

function CaptureSheet({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<CaptureMode>('menu');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    dialog.showModal();
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    titleRef.current?.focus();
  }, [mode]);

  const form = (() => {
    switch (mode) {
      case 'task':
        return <TaskCaptureForm />;
      case 'repair':
        return <RepairCaptureForm />;
      case 'reminder':
        return <ReminderCaptureForm />;
      case 'menu':
        return null;
    }
  })();

  return (
    <dialog
      className="captureSheet"
      ref={dialogRef}
      aria-labelledby="capture-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="sheetHandle" aria-hidden="true" />
      <div className="sheetHeader">
        <div className="sheetTitle">
          {mode !== 'menu' ? (
            <button
              className="sheetBackButton"
              type="button"
              aria-label="Back"
              onClick={() => setMode('menu')}
            >
              <Icon icon={altArrowLeftLinear} width={20} aria-hidden="true" />
            </button>
          ) : null}
          <h2 id="capture-title" ref={titleRef} tabIndex={-1}>
            {captureTitles[mode]}
          </h2>
        </div>
        <button className="textButton" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>

      {mode === 'menu' ? (
        <div className="captureChoices">
          {captureChoices.map((choice) => (
            <button
              className="captureChoice"
              type="button"
              key={choice.mode}
              onClick={() => setMode(choice.mode)}
            >
              <Icon
                className="captureChoice__icon"
                icon={choice.icon}
                width={22}
                aria-hidden="true"
              />
              <span>
                <strong>{choice.label}</strong>
                <small>{choice.description}</small>
              </span>
              <Icon icon={altArrowRightLinear} width={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        form
      )}
    </dialog>
  );
}

interface LiveReadState {
  today: TodayResultPayload;
  work: WorkResultPayload;
  repairs: RepairsResultPayload;
  schedule: ScheduleResultPayload;
}

type LivePhase =
  | 'restoring'
  | 'signed-out'
  | 'authorizing'
  | 'loading'
  | 'ready'
  | 'forbidden'
  | 'error';

type LiveDetail =
  | { type: 'JOB'; id: string }
  | { type: 'TASK'; id: string }
  | { type: 'REPAIR'; id: string };

type AuthorizationFailureHandler = (error: unknown) => boolean;

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

function formatTimestamp(value: string | null): string {
  if (value === null) return 'None';
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toneForTaskStatus(status: TaskViewPayload['task']['status']): Tone {
  if (status === 'WAITING') return 'attention';
  if (status === 'NEXT' || status === 'DOING') return 'info';
  return 'neutral';
}

function toneForJobCategory(category: JobViewPayload['job']['category']): Tone {
  if (category === 'WAITING') return 'attention';
  if (category === 'ACTIVE') return 'info';
  return 'neutral';
}

function toneForRepairStage(stage: RepairViewPayload['repair']['stage']): Tone {
  if (stage === 'AWAITING_PARTS' || stage === 'AWAITING_CUSTOMER') {
    return 'attention';
  }
  if (stage === 'READY') return 'success';
  if (stage === 'DIAGNOSING' || stage === 'REPAIRING' || stage === 'TESTING') {
    return 'info';
  }
  return 'neutral';
}

function LiveTodayView({
  model,
  onActivate,
}: {
  model: TodayViewModel;
  onActivate: (row: UiRow) => void;
}) {
  return (
    <>
      <section className="attentionSummary" aria-label="Today attention summary">
        <div>
          <strong className="summaryValue summaryValue--danger">
            {model.summary.overdue}
          </strong>
          <span>Overdue</span>
        </div>
        <div>
          <strong>{model.summary.today}</strong>
          <span>Today</span>
        </div>
        <div>
          <strong className="summaryValue summaryValue--attention">
            {model.summary.waiting}
          </strong>
          <span>Waiting</span>
        </div>
        <div>
          <strong className="summaryValue summaryValue--success">
            {model.summary.ready}
          </strong>
          <span>Ready</span>
        </div>
      </section>

      <Section
        title="Needs attention"
        count={model.attention.length}
        rows={model.attention}
        onActivateRow={onActivate}
        emptyLabel="Nothing needs attention"
      />
      <Section
        title="Ready for collection"
        count={model.ready.length}
        rows={model.ready}
        onActivateRow={onActivate}
        emptyLabel="Nothing ready for collection"
      />
      <Section
        title="Next"
        count={model.next.length}
        rows={model.next}
        emptyLabel="Nothing scheduled next"
      />
    </>
  );
}

function LiveWorkView({
  model,
  onActivate,
}: {
  model: WorkViewModel;
  onActivate: (row: UiRow) => void;
}) {
  return (
    <>
      <Section
        title="Jobs"
        count={model.jobs.length}
        rows={model.jobs}
        onActivateRow={onActivate}
        emptyLabel="No active Jobs"
      />
      <Section
        title="Tasks"
        count={model.tasks.length}
        rows={model.tasks}
        onActivateRow={onActivate}
        emptyLabel="No active Tasks"
      />
    </>
  );
}

function LiveRepairsView({
  model,
  onActivate,
}: {
  model: RepairsViewModel;
  onActivate: (row: UiRow) => void;
}) {
  if (model.groups.length === 0) {
    return (
      <section className="systemState">
        <strong>No active Repairs</strong>
        <span>Workshop work will appear here when it exists.</span>
      </section>
    );
  }

  return (
    <>
      {model.groups.map((group) => (
        <Section
          key={group.label}
          title={group.label}
          count={group.rows.length}
          rows={group.rows}
          onActivateRow={onActivate}
        />
      ))}
    </>
  );
}

function LiveScheduleView({ model }: { model: ScheduleViewModel }) {
  return (
    <Section
      title="Due & upcoming"
      count={model.rows.length}
      rows={model.rows}
      emptyLabel="No Scheduled Actions"
    />
  );
}

function SystemState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: { label: string; run: () => void };
}) {
  return (
    <main className="authShell">
      <section className="authPanel systemPanel">
        <span className="authEyebrow">ELARA RELAY</span>
        <h1>{title}</h1>
        <p>{detail}</p>
        {action === undefined ? null : (
          <button className="primaryButton" type="button" onClick={action.run}>
            {action.label}
          </button>
        )}
      </section>
    </main>
  );
}

function SignInSurface({
  error,
  onSignIn,
}: {
  error: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <main className="authShell">
      <section className="authPanel" aria-labelledby="sign-in-title">
        <span className="authEyebrow">ELARA RELAY</span>
        <h1 id="sign-in-title">Sign in</h1>
        <p>Use the owner account authorized for this operations workspace.</p>
        <form
          className="authForm"
          onSubmit={(event) => {
            event.preventDefault();
            void onSignIn(email, password);
          }}
        >
          <label className="formField">
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="formField">
            <span>Password</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error === null ? null : (
            <p className="authError" role="alert">
              {error}
            </p>
          )}
          <button className="primaryButton" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

function useLiveDialog(
  open: boolean,
  dialogRef: React.RefObject<HTMLDialogElement | null>,
  focusRef: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    if (dialog === null) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    dialog.showModal();
    document.body.style.overflow = 'hidden';
    focusRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      previousFocus?.focus();
    };
  }, [open, dialogRef, focusRef]);
}

function LiveTaskDetailSurface({
  runtime,
  taskId,
  onClose,
  onAuthorizationFailure,
}: {
  runtime: BrowserRuntime;
  taskId: string;
  onClose: () => void;
  onAuthorizationFailure: AuthorizationFailureHandler;
}) {
  const [data, setData] = useState<TaskViewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useLiveDialog(true, dialogRef, titleRef);

  useEffect(() => {
    if (data !== null) titleRef.current?.focus();
  }, [data]);

  useEffect(() => {
    let active = true;
    void runtime.api
      .task(taskId)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (onAuthorizationFailure(caught)) return;
        setError(readableError(caught));
      });
    return () => {
      active = false;
    };
  }, [onAuthorizationFailure, runtime, taskId]);

  return (
    <dialog
      className="overlaySurface detailSurface"
      ref={dialogRef}
      aria-label={data?.task.title ?? 'Task detail'}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="detailTopBar">
        <button className="detailBackButton" type="button" onClick={onClose}>
          <Icon icon={altArrowLeftLinear} width={20} aria-hidden="true" />
          <span>Back</span>
        </button>
        <span className="liveReadState">Read only · 1G</span>
      </div>
      {error !== null ? (
        <section className="systemState">
          <strong>Task unavailable</strong>
          <span>{error}</span>
        </section>
      ) : data === null ? (
        <section className="systemState">
          <strong>Loading Task</strong>
          <span>Reading current state…</span>
        </section>
      ) : (
        <>
          <section className="repairSummary" aria-labelledby="live-task-detail-title">
            <span className="repairSummary__key">
              TASK{data.job === null ? '' : ` · ${data.job.key}`}
            </span>
            <div className="repairSummary__titleRow">
              <div>
                <h1 id="live-task-detail-title" ref={titleRef} tabIndex={-1}>
                  {data.task.title}
                </h1>
                <p>{data.job?.title ?? 'Standalone Task'}</p>
              </div>
              <StatusBadge tone={toneForTaskStatus(data.task.status)}>
                {titleCase(data.task.status)}
              </StatusBadge>
            </div>
          </section>
          <section className="detailSection" aria-labelledby="live-task-state">
            <div className="detailSection__heading">
              <h2 id="live-task-state">Current state</h2>
            </div>
            <dl className="detailFields">
              <div><dt>Status</dt><dd>{titleCase(data.task.status)}</dd></div>
              <div><dt>Priority</dt><dd>{titleCase(data.task.priority)}</dd></div>
              <div><dt>Due</dt><dd>{formatTimestamp(data.task.dueAt)}</dd></div>
              <div><dt>Follow-up</dt><dd>{formatTimestamp(data.task.followUpAt)}</dd></div>
              <div><dt>Waiting on</dt><dd>{data.task.waitingOn ?? 'None'}</dd></div>
              <div><dt>Updated</dt><dd>{formatTimestamp(data.task.updatedAt)}</dd></div>
              <div><dt>Revision</dt><dd className="detailValue--mono">{data.task.revision}</dd></div>
            </dl>
          </section>
        </>
      )}
    </dialog>
  );
}

function LiveJobDetailSurface({
  runtime,
  jobId,
  onClose,
  onAuthorizationFailure,
}: {
  runtime: BrowserRuntime;
  jobId: string;
  onClose: () => void;
  onAuthorizationFailure: AuthorizationFailureHandler;
}) {
  const [data, setData] = useState<JobViewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useLiveDialog(true, dialogRef, titleRef);

  useEffect(() => {
    if (data !== null) titleRef.current?.focus();
  }, [data]);

  useEffect(() => {
    let active = true;
    void runtime.api
      .job(jobId)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (onAuthorizationFailure(caught)) return;
        setError(readableError(caught));
      });
    return () => {
      active = false;
    };
  }, [jobId, onAuthorizationFailure, runtime]);

  return (
    <dialog
      className="overlaySurface detailSurface"
      ref={dialogRef}
      aria-label={data?.job.title ?? 'Job detail'}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="detailTopBar">
        <button className="detailBackButton" type="button" onClick={onClose}>
          <Icon icon={altArrowLeftLinear} width={20} aria-hidden="true" />
          <span>Back</span>
        </button>
        <span className="liveReadState">Read only · 1G</span>
      </div>
      {error !== null ? (
        <section className="systemState">
          <strong>Job unavailable</strong>
          <span>{error}</span>
        </section>
      ) : data === null ? (
        <section className="systemState">
          <strong>Loading Job</strong>
          <span>Reading current state and history…</span>
        </section>
      ) : (
        <>
          <section className="repairSummary" aria-labelledby="live-job-detail-title">
            <span className="repairSummary__key">{data.job.key}</span>
            <div className="repairSummary__titleRow">
              <div>
                <h1 id="live-job-detail-title" ref={titleRef} tabIndex={-1}>
                  {data.job.title}
                </h1>
                <p>{data.party?.name ?? 'No linked Party'}</p>
              </div>
              <StatusBadge tone={toneForJobCategory(data.job.category)}>
                {titleCase(data.job.category)}
              </StatusBadge>
            </div>
          </section>
          <section className="detailSection" aria-labelledby="live-job-state">
            <div className="detailSection__heading">
              <h2 id="live-job-state">Current state</h2>
            </div>
            <dl className="detailFields">
              <div><dt>Category</dt><dd>{titleCase(data.job.category)}</dd></div>
              <div><dt>Party</dt><dd>{data.party?.name ?? 'None'}</dd></div>
              <div><dt>Updated</dt><dd>{formatTimestamp(data.job.updatedAt)}</dd></div>
              <div><dt>Revision</dt><dd className="detailValue--mono">{data.job.revision}</dd></div>
            </dl>
          </section>
          <section className="detailSection" aria-labelledby="live-job-repair">
            <div className="detailSection__heading">
              <h2 id="live-job-repair">Linked Repair</h2>
              <span>{data.repair === null ? 0 : 1}</span>
            </div>
            {data.repair === null ? (
              <p className="emptyRow">No linked Repair</p>
            ) : (
              <div className="detailCompactRows">
                <div>
                  <span>
                    <strong>{data.repair.reportedFault}</strong>
                    <small>
                      {titleCase(data.repair.stage)}
                      {data.repair.serialValue === null
                        ? ''
                        : ` · serial ${data.repair.serialValue}`}
                      {data.repairWarnings.length === 0
                        ? ''
                        : ` · ${data.repairWarnings.map(titleCase).join(' · ')}`}
                    </small>
                  </span>
                  <StatusBadge tone={toneForRepairStage(data.repair.stage)}>
                    {titleCase(data.repair.stage)}
                  </StatusBadge>
                </div>
              </div>
            )}
          </section>
          <section className="detailSection" aria-labelledby="live-job-tasks">
            <div className="detailSection__heading">
              <h2 id="live-job-tasks">Tasks</h2>
              <span>{data.tasks.length}</span>
            </div>
            <div className="detailCompactRows">
              {data.tasks.length === 0 ? (
                <p className="emptyRow">No linked Tasks</p>
              ) : (
                data.tasks.map((task) => (
                  <div key={task.id}>
                    <span>
                      <strong>{task.title}</strong>
                      <small>{formatTimestamp(task.updatedAt)}</small>
                    </span>
                    <StatusBadge tone={toneForTaskStatus(task.status)}>
                      {titleCase(task.status)}
                    </StatusBadge>
                  </div>
                ))
              )}
            </div>
          </section>
          <section className="detailSection" aria-labelledby="live-job-schedule">
            <div className="detailSection__heading">
              <h2 id="live-job-schedule">Scheduled actions</h2>
              <span>{data.scheduledActions.length}</span>
            </div>
            {data.scheduledActions.length === 0 ? (
              <p className="emptyRow">No Scheduled Actions</p>
            ) : (
              <div className="detailCompactRows">
                {data.scheduledActions.map((action) => (
                  <div key={action.id}>
                    <span>
                      <strong>{action.title}</strong>
                      <small>
                        {titleCase(action.actionType)} · {formatTimestamp(action.nextRunAt)}
                        {action.recurrenceRule === null
                          ? ' · one time'
                          : ` · ${action.recurrenceRule}`}
                      </small>
                    </span>
                    <StatusBadge
                      tone={action.status === 'PAUSED' ? 'neutral' : 'info'}
                    >
                      {titleCase(action.status)}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="detailSection detailTimeline" aria-labelledby="live-job-timeline">
            <div className="detailSection__heading">
              <h2 id="live-job-timeline">Timeline</h2>
              <span>{data.events.length}</span>
            </div>
            <ol>
              {data.events
                .slice()
                .reverse()
                .map((event) => (
                  <li key={event.id}>
                    <span className="detailTimeline__time">
                      {formatTimestamp(event.occurredAt)}
                    </span>
                    <div>
                      <strong>{titleCase(event.eventType)}</strong>
                      <p>{event.detail ?? event.entityType}</p>
                    </div>
                  </li>
                ))}
            </ol>
          </section>
        </>
      )}
    </dialog>
  );
}

function LiveRepairDetailSurface({
  runtime,
  repairId,
  onClose,
  onAuthorizationFailure,
}: {
  runtime: BrowserRuntime;
  repairId: string;
  onClose: () => void;
  onAuthorizationFailure: AuthorizationFailureHandler;
}) {
  const [data, setData] = useState<RepairViewPayload | null>(null);
  const [job, setJob] = useState<JobViewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useLiveDialog(true, dialogRef, titleRef);

  useEffect(() => {
    if (data !== null && job !== null) titleRef.current?.focus();
  }, [data, job]);

  useEffect(() => {
    let active = true;
    void runtime.api
      .repair(repairId)
      .then(async (result) => {
        if (!active) return;
        setData(result);
        const jobResult = await runtime.api.job(result.repair.jobId);
        if (active) setJob(jobResult);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (onAuthorizationFailure(caught)) return;
        setError(readableError(caught));
      });
    return () => {
      active = false;
    };
  }, [onAuthorizationFailure, repairId, runtime]);

  return (
    <dialog
      className="overlaySurface detailSurface"
      ref={dialogRef}
      aria-label={job?.job.title ?? 'Repair detail'}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="detailTopBar">
        <button className="detailBackButton" type="button" onClick={onClose}>
          <Icon icon={altArrowLeftLinear} width={20} aria-hidden="true" />
          <span>Back</span>
        </button>
        <span className="liveReadState">Read only · 1G</span>
      </div>
      {error !== null ? (
        <section className="systemState">
          <strong>Repair unavailable</strong>
          <span>{error}</span>
        </section>
      ) : data === null || job === null ? (
        <section className="systemState">
          <strong>Loading Repair</strong>
          <span>Reading workshop state…</span>
        </section>
      ) : (
        <>
          <section className="repairSummary" aria-labelledby="live-repair-detail-title">
            <span className="repairSummary__key">{job.job.key} · REPAIR</span>
            <div className="repairSummary__titleRow">
              <div>
                <h1 id="live-repair-detail-title" ref={titleRef} tabIndex={-1}>
                  {job.job.title}
                </h1>
                <p>{job.party?.name ?? 'No linked Party'}</p>
              </div>
              <StatusBadge tone={toneForRepairStage(data.repair.stage)}>
                {titleCase(data.repair.stage)}
              </StatusBadge>
            </div>
            {data.warnings.length === 0 ? null : (
              <p className="repairSummary__reason">
                {data.warnings.map(titleCase).join(' · ')}
              </p>
            )}
          </section>
          <section className="detailSection" aria-labelledby="live-repair-state">
            <div className="detailSection__heading">
              <h2 id="live-repair-state">Current state</h2>
            </div>
            <dl className="detailFields">
              <div><dt>Stage</dt><dd>{titleCase(data.repair.stage)}</dd></div>
              <div><dt>Reported fault</dt><dd>{data.repair.reportedFault}</dd></div>
              <div><dt>Diagnosis</dt><dd>{data.repair.diagnosis ?? 'None'}</dd></div>
              <div><dt>Current finding</dt><dd>{data.repair.currentFinding ?? 'None'}</dd></div>
              <div><dt>Serial</dt><dd className="detailValue--mono">{data.repair.serialValue ?? titleCase(data.repair.serialState)}</dd></div>
              <div><dt>Storage</dt><dd>{data.repair.storageLocation ?? 'None'}</dd></div>
              <div><dt>Waiting on</dt><dd>{data.repair.waitingOn ?? 'None'}</dd></div>
              <div><dt>Follow-up</dt><dd>{formatTimestamp(data.repair.followUpAt)}</dd></div>
              <div><dt>Revision</dt><dd className="detailValue--mono">{data.repair.revision}</dd></div>
            </dl>
          </section>
        </>
      )}
    </dialog>
  );
}

function LiveSearchSurface({
  runtime,
  onClose,
  onActivate,
  onAuthorizationFailure,
}: {
  runtime: BrowserRuntime;
  onClose: () => void;
  onActivate: (row: UiRow) => void;
  onAuthorizationFailure: AuthorizationFailureHandler;
}) {
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<SearchGroupViewModel[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useLiveDialog(true, dialogRef, inputRef);

  useEffect(() => {
    const normalized = query.trim();
    const currentRequest = ++requestId.current;

    if (normalized.length < 2) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setState('loading');
      setError(null);
      void runtime.api
        .search(normalized)
        .then((result) => {
          if (requestId.current !== currentRequest) return;
          setGroups(buildSearchGroups(result));
          setState('ready');
        })
        .catch((caught: unknown) => {
          if (requestId.current !== currentRequest) return;
          if (onAuthorizationFailure(caught)) return;
          setGroups([]);
          setError(readableError(caught));
          setState('error');
        });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [onAuthorizationFailure, query, runtime]);

  const resultCount = groups.reduce(
    (count, group) => count + group.rows.length,
    0,
  );

  return (
    <dialog
      className="overlaySurface"
      ref={dialogRef}
      aria-label="Search"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="overlayHeader">
        <div>
          <h1>Search</h1>
          <p>Jobs, repairs, tasks and history</p>
        </div>
        <button className="textButton" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <label className="searchField">
        <Icon icon={magniferLinear} width={20} aria-hidden="true" />
        <span className="srOnly">Search Elara</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
          placeholder="Job, serial, task, customer…"
          type="search"
        />
      </label>

      {query.trim().length < 2 ? (
        <div className="searchHint">
          <Icon icon={magniferLinear} width={20} aria-hidden="true" />
          <span>Enter at least two characters to search operational history.</span>
        </div>
      ) : (
        <div className="searchResults" aria-label="Search results">
          <div className="searchResultSummary" role="status">
            <span>
              {state === 'loading'
                ? 'Searching…'
                : state === 'error'
                  ? 'Search failed'
                  : 'Results'}
            </span>
            <strong>{resultCount}</strong>
          </div>
          {state === 'error' ? (
            <div className="searchNoResults">
              <strong>Search unavailable</strong>
              <span>{error}</span>
            </div>
          ) : state === 'ready' && resultCount === 0 ? (
            <div className="searchNoResults">
              <strong>No results</strong>
              <span>No operational records matched this query.</span>
            </div>
          ) : (
            groups.map((group) => (
              <section
                className="searchResultGroup"
                key={group.label}
                aria-labelledby={`live-search-${group.label.toLowerCase()}`}
              >
                <div className="searchGroupHeading">
                  <h2 id={`live-search-${group.label.toLowerCase()}`}>
                    {group.label}
                  </h2>
                  <span>{group.rows.length}</span>
                </div>
                <div className="searchResultList">
                  {group.rows.map((row) => {
                    const content = (
                      <>
                        <span className="searchResultRow__eyebrow">
                          {row.eyebrow}
                        </span>
                        <strong>{row.title}</strong>
                        <span>{row.meta}</span>
                      </>
                    );
                    const canOpen =
                      row.entityType === 'JOB' ||
                      row.entityType === 'TASK' ||
                      row.entityType === 'REPAIR';

                    return canOpen ? (
                      <button
                        className="searchResultRow searchResultRow--button"
                        type="button"
                        key={row.id}
                        onClick={() => {
                          onClose();
                          onActivate(row);
                        }}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="searchResultRow" key={row.id}>
                        {content}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </dialog>
  );
}

function LiveApp({ runtime }: { runtime: BrowserRuntime }) {
  const [phase, setPhase] = useState<LivePhase>('restoring');
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [readState, setReadState] = useState<LiveReadState | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewId>('today');
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [detail, setDetail] = useState<LiveDetail | null>(null);
  const loadSequence = useRef(0);
  const authorizedUserIdRef = useRef<string | null>(null);

  const clearOperationalState = useCallback(() => {
    authorizedUserIdRef.current = null;
    setIdentity(null);
    setReadState(null);
    setSearchOpen(false);
    setCaptureOpen(false);
    setDetail(null);
  }, []);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setPhase('authorizing');
    setLoadError(null);

    const attempt = async (allowRefresh: boolean): Promise<void> => {
      try {
        const verifiedIdentity = await runtime.api.whoAmI();
        if (sequence !== loadSequence.current) return;
        authorizedUserIdRef.current = verifiedIdentity.userId;
        setIdentity(verifiedIdentity);
        setPhase('loading');

        const asOf = new Date().toISOString();
        const [today, work, repairs, schedule] = await Promise.all([
          runtime.api.today(asOf),
          runtime.api.work(),
          runtime.api.repairs(),
          runtime.api.schedule(asOf),
        ]);
        if (sequence !== loadSequence.current) return;

        setReadState({ today, work, repairs, schedule });
        setPhase('ready');
      } catch (caught: unknown) {
        if (sequence !== loadSequence.current) return;

        if (
          caught instanceof OperationsApiError &&
          caught.status === 401 &&
          allowRefresh
        ) {
          try {
            const refreshed = await runtime.auth.refreshSession();
            if (sequence !== loadSequence.current) return;
            if (refreshed !== null) {
              await attempt(false);
              return;
            }
          } catch {
            // Fall through to the signed-out state below.
          }
        }

        clearOperationalState();

        if (caught instanceof OperationsApiError && caught.status === 403) {
          setPhase('forbidden');
        } else if (
          caught instanceof OperationsApiError &&
          caught.status === 401
        ) {
          setPhase('signed-out');
        } else {
          setLoadError(readableError(caught));
          setPhase('error');
        }
      }
    };

    await attempt(true);
  }, [clearOperationalState, runtime]);

  const handleAuthorizationFailure = useCallback(
    (caught: unknown): boolean => {
      if (
        !(caught instanceof OperationsApiError) ||
        (caught.status !== 401 && caught.status !== 403)
      ) {
        return false;
      }

      clearOperationalState();

      if (caught.status === 403) {
        loadSequence.current += 1;
        setPhase('forbidden');
      } else {
        void load();
      }
      return true;
    },
    [clearOperationalState, load],
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = runtime.auth.subscribe((session) => {
      if (!active) return;

      if (session === null) {
        loadSequence.current += 1;
        clearOperationalState();
        setPhase('signed-out');
        return;
      }

      const authorizedUserId = authorizedUserIdRef.current;
      if (
        authorizedUserId !== null &&
        session.userId !== authorizedUserId
      ) {
        clearOperationalState();
        void load();
      }
    });

    void runtime.auth
      .restoreSession()
      .then((session) => {
        if (!active) return;
        if (session === null) {
          setPhase('signed-out');
          return;
        }
        void load();
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setAuthError(readableError(caught));
        setPhase('signed-out');
      });

    return () => {
      active = false;
      loadSequence.current += 1;
      unsubscribe();
    };
  }, [clearOperationalState, load, runtime]);

  const signIn = async (email: string, password: string) => {
    setAuthError(null);
    setPhase('authorizing');
    try {
      await runtime.auth.signIn(email, password);
      await load();
    } catch (caught: unknown) {
      clearOperationalState();
      setAuthError(readableError(caught));
      setPhase('signed-out');
    }
  };

  const signOut = async () => {
    loadSequence.current += 1;
    clearOperationalState();
    setPhase('signed-out');
    try {
      await runtime.auth.signOut();
    } catch (caught: unknown) {
      setAuthError(readableError(caught));
    }
  };

  const activate = (row: UiRow) => {
    if (
      row.entityType === 'JOB' ||
      row.entityType === 'TASK' ||
      row.entityType === 'REPAIR'
    ) {
      setDetail({ type: row.entityType, id: row.id });
    }
  };

  if (phase === 'restoring' || phase === 'authorizing' || phase === 'loading') {
    return (
      <SystemState
        title={phase === 'restoring' ? 'Restoring session' : 'Loading workspace'}
        detail="Checking identity and reading current operational state…"
      />
    );
  }

  if (phase === 'signed-out') {
    return <SignInSurface error={authError} onSignIn={signIn} />;
  }

  if (phase === 'forbidden') {
    return (
      <SystemState
        title="Access not authorized"
        detail="This Supabase account is valid, but it is not in Elara's server-side owner allowlist."
        action={{
          label: 'Sign out',
          run: () => {
            void signOut();
          },
        }}
      />
    );
  }

  if (phase === 'error' || readState === null) {
    return (
      <SystemState
        title="Workspace unavailable"
        detail={loadError ?? 'Operational data could not be loaded.'}
        action={{
          label: 'Retry',
          run: () => {
            void load();
          },
        }}
      />
    );
  }

  const todayModel = buildTodayView(
    readState.today,
    readState.repairs,
    readState.schedule,
  );
  const workModel = buildWorkView(readState.work);
  const repairsModel = buildRepairsView(readState.repairs);
  const scheduleModel = buildScheduleView(
    readState.schedule,
    readState.work,
  );
  const context = viewContext[activeView];

  const view = (() => {
    switch (activeView) {
      case 'today':
        return <LiveTodayView model={todayModel} onActivate={activate} />;
      case 'work':
        return <LiveWorkView model={workModel} onActivate={activate} />;
      case 'repairs':
        return <LiveRepairsView model={repairsModel} onActivate={activate} />;
      case 'schedule':
        return <LiveScheduleView model={scheduleModel} />;
    }
  })();

  return (
    <main className="appShell">
      <header className="topBar">
        <div className="topContext">
          <h1>{context.title}</h1>
          <span>{context.meta}</span>
        </div>
        <div className="topActions">
          <button
            className="onlineState"
            type="button"
            aria-label="Sign out"
            title={identity?.email ?? 'Signed in'}
            onClick={() => {
              void signOut();
            }}
          >
            <span aria-hidden="true" />
            Online
          </button>
          <button
            className="iconButton"
            type="button"
            aria-label="Search"
            onClick={() => setSearchOpen(true)}
          >
            <Icon icon={magniferLinear} width={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="contentViewport">{view}</div>

      <nav className="bottomNav" aria-label="Primary">
        {navItems.slice(0, 2).map((item) => (
          <button
            className={activeView === item.id ? 'navItem navItem--active' : 'navItem'}
            type="button"
            key={item.id}
            aria-current={activeView === item.id ? 'page' : undefined}
            onClick={() => setActiveView(item.id)}
          >
            <Icon icon={item.icon} width={21} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}

        <button
          className="captureButton"
          type="button"
          aria-label="Capture"
          onClick={() => setCaptureOpen(true)}
        >
          <span>
            <Icon icon={addCircleBold} width={24} aria-hidden="true" />
          </span>
          <small>Capture</small>
        </button>

        {navItems.slice(2).map((item) => (
          <button
            className={activeView === item.id ? 'navItem navItem--active' : 'navItem'}
            type="button"
            key={item.id}
            aria-current={activeView === item.id ? 'page' : undefined}
            onClick={() => setActiveView(item.id)}
          >
            <Icon icon={item.icon} width={21} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {searchOpen ? (
        <LiveSearchSurface
          runtime={runtime}
          onClose={() => setSearchOpen(false)}
          onActivate={activate}
          onAuthorizationFailure={handleAuthorizationFailure}
        />
      ) : null}
      {captureOpen ? <CaptureSheet onClose={() => setCaptureOpen(false)} /> : null}
      {detail?.type === 'JOB' ? (
        <LiveJobDetailSurface
          runtime={runtime}
          jobId={detail.id}
          onClose={() => setDetail(null)}
          onAuthorizationFailure={handleAuthorizationFailure}
        />
      ) : null}
      {detail?.type === 'TASK' ? (
        <LiveTaskDetailSurface
          runtime={runtime}
          taskId={detail.id}
          onClose={() => setDetail(null)}
          onAuthorizationFailure={handleAuthorizationFailure}
        />
      ) : null}
      {detail?.type === 'REPAIR' ? (
        <LiveRepairDetailSurface
          runtime={runtime}
          repairId={detail.id}
          onClose={() => setDetail(null)}
          onAuthorizationFailure={handleAuthorizationFailure}
        />
      ) : null}
    </main>
  );
}

function PreviewApp() {
  const [activeView, setActiveView] = useState<ViewId>('today');
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [jobDetailOpen, setJobDetailOpen] = useState(false);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [repairDetailOpen, setRepairDetailOpen] = useState(false);
  const context = viewContext[activeView];

  const view = (() => {
    switch (activeView) {
      case 'today':
        return <TodayView onOpenRepair={() => setRepairDetailOpen(true)} />;
      case 'work':
        return (
          <WorkView
            onOpenJob={() => setJobDetailOpen(true)}
            onOpenTask={() => setTaskDetailOpen(true)}
          />
        );
      case 'repairs':
        return <RepairsView onOpenRepair={() => setRepairDetailOpen(true)} />;
      case 'schedule':
        return <ScheduleView />;
    }
  })();

  return (
    <main className="appShell">
      <header className="topBar">
        <div className="topContext">
          <h1>{context.title}</h1>
          <span>{context.meta}</span>
        </div>
        <div className="topActions">
          <span className="previewState" role="status">
            <span aria-hidden="true" />
            Preview
          </span>
          <button
            className="iconButton"
            type="button"
            aria-label="Search"
            onClick={() => setSearchOpen(true)}
          >
            <Icon icon={magniferLinear} width={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="contentViewport">{view}</div>

      <nav className="bottomNav" aria-label="Primary">
        {navItems.slice(0, 2).map((item) => (
          <button
            className={activeView === item.id ? 'navItem navItem--active' : 'navItem'}
            type="button"
            key={item.id}
            aria-current={activeView === item.id ? 'page' : undefined}
            onClick={() => setActiveView(item.id)}
          >
            <Icon icon={item.icon} width={21} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}

        <button
          className="captureButton"
          type="button"
          aria-label="Capture"
          onClick={() => setCaptureOpen(true)}
        >
          <span>
            <Icon icon={addCircleBold} width={24} aria-hidden="true" />
          </span>
          <small>Capture</small>
        </button>

        {navItems.slice(2).map((item) => (
          <button
            className={activeView === item.id ? 'navItem navItem--active' : 'navItem'}
            type="button"
            key={item.id}
            aria-current={activeView === item.id ? 'page' : undefined}
            onClick={() => setActiveView(item.id)}
          >
            <Icon icon={item.icon} width={21} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {searchOpen ? <SearchSurface onClose={() => setSearchOpen(false)} /> : null}
      {captureOpen ? <CaptureSheet onClose={() => setCaptureOpen(false)} /> : null}
      {jobDetailOpen ? (
        <JobDetailSurface onClose={() => setJobDetailOpen(false)} />
      ) : null}
      {taskDetailOpen ? (
        <TaskDetailSurface onClose={() => setTaskDetailOpen(false)} />
      ) : null}
      {repairDetailOpen ? (
        <RepairDetailSurface onClose={() => setRepairDetailOpen(false)} />
      ) : null}
    </main>
  );
}

export function App({
  runtime,
  configurationError,
}: {
  runtime?: BrowserRuntime | undefined;
  configurationError?: string | undefined;
}) {
  if (configurationError !== undefined) {
    return (
      <SystemState
        title="Configuration required"
        detail={configurationError}
      />
    );
  }

  return runtime === undefined ? <PreviewApp /> : <LiveApp runtime={runtime} />;
}
