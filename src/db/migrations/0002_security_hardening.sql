begin;

alter table public.parties enable row level security;
alter table public.jobs enable row level security;
alter table public.tasks enable row level security;
alter table public.events enable row level security;
alter table public.mutation_receipts enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table
      public.parties,
      public.jobs,
      public.tasks,
      public.events,
      public.mutation_receipts
    from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table
      public.parties,
      public.jobs,
      public.tasks,
      public.events,
      public.mutation_receipts
    from authenticated;
  end if;
end;
$$;

alter function public.reject_event_mutation()
set search_path = pg_catalog, public;

commit;
