begin;

-- Consecutive delivery failures drive exponential retry backoff (five
-- minutes, doubling, capped at twenty-four hours). A success resets the
-- count to zero. Without this column a failing provider would be retried on
-- every scheduler pass with no delay.
alter table scheduled_actions
  add column consecutive_failures bigint not null default 0 check (
    consecutive_failures between 0 and 9007199254740991
  );

commit;
