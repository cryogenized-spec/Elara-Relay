begin;

alter table events
  drop constraint if exists events_entity_type_check;

alter table events
  add constraint events_entity_type_check
  check (
    entity_type in (
      'PARTY',
      'JOB',
      'TASK',
      'REPAIR',
      'SCHEDULED_ACTION'
    )
  );

alter table events
  drop constraint if exists events_event_type_check;

alter table events
  add constraint events_event_type_check
  check (
    event_type in (
      'PARTY_CREATED',
      'JOB_CREATED',
      'TASK_CREATED',
      'TASK_UPDATED',
      'TASK_WAITING',
      'TASK_COMPLETED',
      'TASK_CANCELLED',
      'REPAIR_CREATED',
      'REPAIR_DETAILS_UPDATED',
      'REPAIR_STAGE_CHANGED',
      'REPAIR_TEST_RECORDED',
      'SCHEDULED_ACTION_CREATED',
      'SCHEDULED_ACTION_UPDATED',
      'SCHEDULED_ACTION_PAUSED',
      'SCHEDULED_ACTION_RESUMED',
      'SCHEDULED_ACTION_CANCELLED',
      'SCHEDULED_ACTION_RUN_CLAIMED',
      'SCHEDULED_ACTION_RUN_SUCCEEDED',
      'SCHEDULED_ACTION_RUN_FAILED',
      'JOB_NOTE'
    )
  );

create table scheduled_actions (
  id uuid primary key,
  job_id uuid references jobs(id) on delete restrict,
  task_id uuid references tasks(id) on delete restrict,
  title text not null check (
    char_length(trim(title)) between 1 and 240
  ),
  action_type text not null check (
    action_type in ('REMINDER', 'DIGEST', 'EMAIL')
  ),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and payload ? 'kind'
    and payload ->> 'kind' = action_type
  ),
  timezone text not null check (
    timezone = 'Africa/Johannesburg'
  ),
  recurrence_rule text check (
    recurrence_rule is null
    or recurrence_rule ~ '^FREQ=(DAILY|WEEKLY);INTERVAL=([1-9][0-9]{0,2})$'
  ),
  status text not null check (
    status in ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')
  ),
  run_at timestamptz not null,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  revision bigint not null check (
    revision between 1 and 9007199254740991
  ),
  check (
    (
      status in ('COMPLETED', 'CANCELLED')
      and next_run_at is null
    )
    or
    (
      status in ('ACTIVE', 'PAUSED')
      and next_run_at is not null
    )
  ),
  check (
    action_type <> 'EMAIL'
    or (
      payload ? 'recipient'
      and payload ? 'subject'
      and payload ? 'body'
      and payload ->> 'recipient' = 'OWNER'
      and char_length(trim(payload ->> 'subject')) between 1 and 240
      and char_length(trim(payload ->> 'body')) between 1 and 12000
    )
  ),
  check (
    action_type <> 'REMINDER'
    or (
      payload ? 'message'
      and char_length(trim(payload ->> 'message')) between 1 and 4000
    )
  ),
  check (
    action_type <> 'DIGEST'
    or (
      payload ? 'scope'
      and payload ->> 'scope' = 'TODAY'
    )
  )
);

create index scheduled_actions_due_idx
  on scheduled_actions (next_run_at, id)
  where status = 'ACTIVE';

create index scheduled_actions_job_id_idx
  on scheduled_actions (job_id)
  where job_id is not null;

create index scheduled_actions_task_id_idx
  on scheduled_actions (task_id)
  where task_id is not null;

create table scheduled_action_runs (
  id uuid primary key,
  scheduled_action_id uuid not null
    references scheduled_actions(id) on delete restrict,
  occurrence_key text not null unique check (
    char_length(occurrence_key) between 1 and 220
  ),
  scheduled_for timestamptz not null,
  status text not null check (
    status in ('CLAIMED', 'SUCCEEDED', 'FAILED')
  ),
  lease_token uuid not null unique,
  worker_id text not null check (
    char_length(trim(worker_id)) between 1 and 160
  ),
  lease_expires_at timestamptz not null,
  attempt bigint not null check (
    attempt between 1 and 9007199254740991
  ),
  provider_message_id text check (
    provider_message_id is null
    or char_length(trim(provider_message_id)) between 1 and 500
  ),
  error_code text check (
    error_code is null
    or char_length(trim(error_code)) between 1 and 120
  ),
  error_detail text check (
    error_detail is null
    or char_length(trim(error_detail)) between 1 and 4000
  ),
  claimed_at timestamptz not null,
  completed_at timestamptz,
  check (lease_expires_at > claimed_at),
  check (completed_at is null or completed_at >= claimed_at),
  check (
    (
      status = 'CLAIMED'
      and completed_at is null
      and provider_message_id is null
      and error_code is null
      and error_detail is null
    )
    or
    (
      status = 'SUCCEEDED'
      and completed_at is not null
      and error_code is null
      and error_detail is null
    )
    or
    (
      status = 'FAILED'
      and completed_at is not null
      and provider_message_id is null
      and error_code is not null
    )
  )
);

create index scheduled_action_runs_action_idx
  on scheduled_action_runs (scheduled_action_id, scheduled_for desc);

create index scheduled_action_runs_retry_idx
  on scheduled_action_runs (status, lease_expires_at)
  where status in ('CLAIMED', 'FAILED');

alter table public.scheduled_actions enable row level security;
alter table public.scheduled_action_runs enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table
      public.scheduled_actions,
      public.scheduled_action_runs
    from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table
      public.scheduled_actions,
      public.scheduled_action_runs
    from authenticated;
  end if;
end;
$$;

commit;
