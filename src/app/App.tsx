import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import addCircleBold from '@iconify-icons/solar/add-circle-bold';
import altArrowRightLinear from '@iconify-icons/solar/alt-arrow-right-linear';
import calendarLinear from '@iconify-icons/solar/calendar-linear';
import caseRoundLinear from '@iconify-icons/solar/case-round-linear';
import clipboardListLinear from '@iconify-icons/solar/clipboard-list-linear';
import home2Linear from '@iconify-icons/solar/home-2-linear';
import magniferLinear from '@iconify-icons/solar/magnifer-linear';
import settingsLinear from '@iconify-icons/solar/settings-linear';

type ViewId = 'today' | 'work' | 'repairs' | 'schedule';
type Tone = 'danger' | 'attention' | 'success' | 'info' | 'neutral';

interface WorkRow {
  id: string;
  eyebrow: string;
  title: string;
  meta: string;
  badge: string;
  tone: Tone;
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

const workGroups = [
  {
    label: 'Inbox',
    rows: [
      {
        id: 'inbox-1',
        eyebrow: 'TASK',
        title: 'Inspect returned CO₂ pistol',
        meta: 'No due date · captured 08:12',
        badge: 'Inbox',
        tone: 'neutral' as const,
      },
    ],
  },
  { label: 'Next', rows: nextRows.slice(0, 1) },
  {
    label: 'Doing',
    rows: [
      {
        id: 'doing-1',
        eyebrow: 'TASK · JOB-7A31C4F2',
        title: 'Pressure-test regulator block',
        meta: 'Started 09:04 · high priority',
        badge: 'Doing',
        tone: 'info' as const,
      },
    ],
  },
  { label: 'Waiting', rows: attentionRows.slice(0, 1) },
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

const captureChoices = [
  {
    label: 'Task',
    description: 'Capture a concrete next action',
    icon: clipboardListLinear,
  },
  {
    label: 'Repair / Job',
    description: 'Open workshop work with a durable timeline',
    icon: settingsLinear,
  },
  {
    label: 'Reminder',
    description: 'Schedule a one-time or recurring action',
    icon: calendarLinear,
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

function Row({ row }: { row: WorkRow }) {
  return (
    <button className="workRow" type="button">
      <span className="workRow__body">
        <span className="workRow__eyebrow">{row.eyebrow}</span>
        <span className="workRow__title">{row.title}</span>
        <span className="workRow__meta">{row.meta}</span>
      </span>
      <span className="workRow__aside">
        <StatusBadge tone={row.tone}>{row.badge}</StatusBadge>
        <Icon icon={altArrowRightLinear} width={18} aria-hidden="true" />
      </span>
    </button>
  );
}

function Section({
  title,
  count,
  rows,
}: {
  title: string;
  count: number;
  rows: WorkRow[];
}) {
  const id = sectionId(title);

  return (
    <section className="sectionBlock" aria-labelledby={id}>
      <div className="sectionHeading">
        <h2 id={id}>{title}</h2>
        <span aria-label={`${count} items`}>{count}</span>
      </div>
      <div className="rowList">
        {rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}

function TodayView() {
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

      <Section title="Needs attention" count={2} rows={attentionRows} />
      <Section title="Ready for collection" count={1} rows={readyRows} />
      <Section title="Next" count={2} rows={nextRows} />
    </>
  );
}

function WorkView() {
  return (
    <>
      {workGroups.map((group) => (
        <Section
          key={group.label}
          title={group.label}
          count={group.rows.length}
          rows={group.rows}
        />
      ))}
    </>
  );
}

function RepairsView() {
  return (
    <>
      {repairGroups.map((group) => (
        <Section
          key={group.label}
          title={group.label}
          count={group.rows.length}
          rows={group.rows}
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);

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
          placeholder="Job, serial, task, customer…"
          type="search"
        />
      </label>
      <div className="searchHint">
        <Icon icon={magniferLinear} width={20} aria-hidden="true" />
        <span>
          Search customers, Job keys, repair serials, faults, schedules and
          event detail.
        </span>
      </div>
    </dialog>
  );
}

function CaptureSheet({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    titleRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);

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
        <h2 id="capture-title" ref={titleRef} tabIndex={-1}>
          Capture
        </h2>
        <button className="textButton" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="captureChoices">
        {captureChoices.map((choice) => (
          <button className="captureChoice" type="button" key={choice.label}>
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
    </dialog>
  );
}

export function App() {
  const [activeView, setActiveView] = useState<ViewId>('today');
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const context = viewContext[activeView];

  const view = (() => {
    switch (activeView) {
      case 'today':
        return <TodayView />;
      case 'work':
        return <WorkView />;
      case 'repairs':
        return <RepairsView />;
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
    </main>
  );
}
