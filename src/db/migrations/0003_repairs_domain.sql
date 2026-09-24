begin;

alter table events
  drop constraint if exists events_entity_type_check;

alter table events
  add constraint events_entity_type_check
  check (entity_type in ('PARTY', 'JOB', 'TASK', 'REPAIR'));

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
      'JOB_NOTE'
    )
  );

create table repairs (
  id uuid primary key,
  job_id uuid not null unique references jobs(id) on delete restrict,
  stage text not null check (
    stage in (
      'RECEIVED',
      'DIAGNOSING',
      'AWAITING_PARTS',
      'AWAITING_CUSTOMER',
      'REPAIRING',
      'TESTING',
      'READY',
      'COLLECTED',
      'CANCELLED'
    )
  ),
  reported_fault text not null check (
    char_length(trim(reported_fault)) between 1 and 4000
  ),
  diagnosis text check (
    diagnosis is null
    or char_length(trim(diagnosis)) between 1 and 4000
  ),
  current_finding text check (
    current_finding is null
    or char_length(trim(current_finding)) between 1 and 4000
  ),
  serial_state text not null check (
    serial_state in ('KNOWN', 'UNKNOWN', 'NOT_APPLICABLE')
  ),
  serial_value text check (
    serial_value is null
    or char_length(trim(serial_value)) between 1 and 120
  ),
  storage_location text check (
    storage_location is null
    or char_length(trim(storage_location)) between 1 and 200
  ),
  waiting_on text check (
    waiting_on is null
    or char_length(trim(waiting_on)) between 1 and 240
  ),
  follow_up_at timestamptz,
  final_test_result text check (
    final_test_result is null
    or final_test_result in ('PASS', 'FAIL')
  ),
  final_test_detail text check (
    final_test_detail is null
    or char_length(trim(final_test_detail)) between 1 and 4000
  ),
  tested_at timestamptz,
  received_at timestamptz not null,
  ready_at timestamptz,
  collected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  revision bigint not null check (
    revision between 1 and 9007199254740991
  ),
  check (
    (serial_state = 'KNOWN' and serial_value is not null)
    or
    (serial_state <> 'KNOWN' and serial_value is null)
  ),
  check (
    (
      stage in ('AWAITING_PARTS', 'AWAITING_CUSTOMER')
      and waiting_on is not null
      and follow_up_at is not null
    )
    or
    (
      stage not in ('AWAITING_PARTS', 'AWAITING_CUSTOMER')
      and waiting_on is null
      and follow_up_at is null
    )
  ),
  check (
    (final_test_result is null and tested_at is null)
    or
    (final_test_result is not null and tested_at is not null)
  ),
  check (
    stage not in ('READY', 'COLLECTED')
    or final_test_result = 'PASS'
  ),
  check (
    (
      stage in ('READY', 'COLLECTED')
      and ready_at is not null
    )
    or
    (
      stage not in ('READY', 'COLLECTED')
      and ready_at is null
    )
  ),
  check (
    (stage = 'COLLECTED' and collected_at is not null)
    or
    (stage <> 'COLLECTED' and collected_at is null)
  ),
  check (
    (stage = 'CANCELLED' and cancelled_at is not null)
    or
    (stage <> 'CANCELLED' and cancelled_at is null)
  )
);

create index repairs_stage_attention_idx
  on repairs (stage, follow_up_at, updated_at);

create index repairs_serial_value_idx
  on repairs (serial_value)
  where serial_value is not null;

alter table public.repairs enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.repairs from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.repairs from authenticated;
  end if;
end;
$$;

commit;
