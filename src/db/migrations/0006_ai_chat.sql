begin;

create table public.chat_threads (
  id uuid primary key,
  owner_id uuid not null,
  title text null check (
    title is null or char_length(title) between 1 and 200
  ),
  revision bigint not null default 1 check (
    revision between 1 and 9007199254740991
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  check (updated_at >= created_at)
);

create index chat_threads_owner_updated_idx
  on public.chat_threads (owner_id, updated_at desc, id desc);

create table public.chat_messages (
  id uuid primary key,
  thread_id uuid not null,
  owner_id uuid not null,
  turn_id uuid not null,
  role text not null check (role in ('USER', 'ASSISTANT')),
  status text not null check (status in ('PENDING', 'COMPLETED', 'FAILED')),
  content text not null,
  provider_id text null,
  model_id text null,
  generation_id uuid null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  input_tokens bigint null check (
    input_tokens is null or input_tokens between 0 and 9007199254740991
  ),
  output_tokens bigint null check (
    output_tokens is null or output_tokens between 0 and 9007199254740991
  ),
  failure_code text null check (
    failure_code is null or failure_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
  ),
  foreign key (thread_id, owner_id)
    references public.chat_threads (id, owner_id) on delete restrict,
  unique (thread_id, turn_id, role),
  unique (generation_id),
  check (
    (
      role = 'USER'
      and status = 'COMPLETED'
      and char_length(content) between 1 and 12000
      and provider_id is null
      and model_id is null
      and generation_id is null
      and completed_at is not null
      and input_tokens is null
      and output_tokens is null
      and failure_code is null
    )
    or
    (
      role = 'ASSISTANT'
      and provider_id is not null
      and model_id is not null
      and generation_id is not null
      and (
        (provider_id = 'openai' and model_id = 'gpt-6-luna')
        or
        (
          provider_id = 'muse'
          and model_id = 'muse-spark-1.3-contributor'
        )
      )
      and (
        (
          status = 'PENDING'
          and content = ''
          and completed_at is null
          and input_tokens is null
          and output_tokens is null
          and failure_code is null
        )
        or
        (
          status = 'COMPLETED'
          and char_length(content) between 1 and 40000
          and completed_at is not null
          and failure_code is null
        )
        or
        (
          status = 'FAILED'
          and content = ''
          and completed_at is not null
          and failure_code is not null
          and input_tokens is null
          and output_tokens is null
        )
      )
    )
  )
);

create function public.enforce_chat_message_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $
begin
  if tg_op = 'DELETE' then
    raise exception 'chat messages are append-only';
  end if;

  if old.status <> 'PENDING'
    or old.role <> 'ASSISTANT'
    or new.status not in ('COMPLETED', 'FAILED')
  then
    raise exception 'chat message transition is invalid';
  end if;

  if new.id <> old.id
    or new.thread_id <> old.thread_id
    or new.owner_id <> old.owner_id
    or new.turn_id <> old.turn_id
    or new.role <> old.role
    or new.provider_id <> old.provider_id
    or new.model_id <> old.model_id
    or new.generation_id <> old.generation_id
    or new.created_at <> old.created_at
  then
    raise exception 'chat message identity and provenance are immutable';
  end if;

  return new;
end;
$;

create trigger chat_messages_append_only
before update or delete on public.chat_messages
for each row execute function public.enforce_chat_message_transition();

create index chat_messages_thread_order_idx
  on public.chat_messages (thread_id, created_at, id);

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.chat_threads, public.chat_messages from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.chat_threads, public.chat_messages
      from authenticated;
  end if;
end;
$$;

commit;
