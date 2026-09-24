begin;

create table parties (
  id uuid primary key,
  name text not null check (char_length(trim(name)) between 1 and 200),
  kind text not null check (kind in ('CUSTOMER', 'SUPPLIER', 'COLLEAGUE', 'OTHER')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  revision bigint not null check (revision between 1 and 9007199254740991)
);

create table jobs (
  id uuid primary key,
  job_key text not null unique check (job_key ~ '^JOB-[A-F0-9]{8}$'),
  title text not null check (char_length(trim(title)) between 1 and 240),
  category text not null check (category in ('INBOX', 'ACTIVE', 'WAITING', 'DONE', 'CANCELLED')),
  party_id uuid references parties(id) on delete restrict,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  revision bigint not null check (revision between 1 and 9007199254740991)
);

create table tasks (
  id uuid primary key,
  job_id uuid references jobs(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 240),
  status text not null check (status in ('INBOX', 'NEXT', 'DOING', 'WAITING', 'DONE', 'CANCELLED')),
  priority text not null check (priority in ('URGENT', 'HIGH', 'NORMAL', 'LOW')),
  due_at timestamptz,
  follow_up_at timestamptz,
  waiting_on text check (waiting_on is null or char_length(trim(waiting_on)) between 1 and 240),
  waiting_since timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  revision bigint not null check (revision between 1 and 9007199254740991),
  check (
    (status = 'WAITING' and waiting_on is not null and waiting_since is not null)
    or
    (status <> 'WAITING' and waiting_on is null and waiting_since is null)
  )
);

create table events (
  id uuid primary key,
  mutation_id text not null unique,
  entity_type text not null check (entity_type in ('PARTY', 'JOB', 'TASK')),
  entity_id uuid not null,
  event_type text not null check (
    event_type in (
      'PARTY_CREATED',
      'JOB_CREATED',
      'TASK_CREATED',
      'TASK_UPDATED',
      'TASK_WAITING',
      'TASK_COMPLETED',
      'JOB_NOTE'
    )
  ),
  actor text not null check (actor in ('operator-ui', 'chatgpt', 'embedded-ai', 'system')),
  occurred_at timestamptz not null,
  detail text check (detail is null or char_length(detail) <= 4000),
  changes jsonb not null default '{}'::jsonb,
  revision_after bigint not null check (revision_after > 0)
);

create table mutation_receipts (
  mutation_id text primary key,
  command text not null,
  fingerprint text not null,
  result jsonb not null,
  committed_at timestamptz not null
);

create index tasks_attention_idx on tasks (status, due_at, follow_up_at);
create index tasks_job_id_idx on tasks (job_id);
create index jobs_party_id_idx on jobs (party_id);
create index events_entity_idx on events (entity_type, entity_id, occurred_at);
create index events_mutation_id_idx on events (mutation_id);

create function reject_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'events are append-only';
end;
$$;

create trigger events_append_only
before update or delete on events
for each row execute function reject_event_mutation();

commit;
