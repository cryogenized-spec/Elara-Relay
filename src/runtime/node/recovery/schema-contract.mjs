// Recovery schema contract.
//
// This module is the recovery-side description of the authoritative Elara
// durable state: which tables must exist, which security posture must
// survive a restore, and which uniqueness guarantees recovery must prove.
//
// It is NOT a second schema authority: it never creates schema. The reviewed
// migrations under src/db/migrations/ remain the only DDL authority. This
// contract exists so backup and restore verification can fail loudly when a
// required object is missing or an unexpected object appears, instead of
// silently skipping a domain.

const EXPECTED_TABLES = [
  {
    name: 'parties',
    domain: 'party',
    primaryKey: ['id'],
    referencedBy: ['jobs.party_id'],
  },
  {
    name: 'jobs',
    domain: 'job',
    primaryKey: ['id'],
    uniqueIdentity: ['job_key'],
    referencedBy: ['tasks.job_id', 'repairs.job_id'],
  },
  {
    name: 'tasks',
    domain: 'task',
    primaryKey: ['id'],
    referencedBy: ['scheduled_actions.task_id'],
  },
  {
    name: 'events',
    domain: 'event',
    primaryKey: ['id'],
    appendOnly: true,
    uniqueIdentity: ['mutation_id'],
  },
  {
    name: 'mutation_receipts',
    domain: 'mutation-receipt',
    primaryKey: ['mutation_id'],
  },
  {
    name: 'repairs',
    domain: 'repair',
    primaryKey: ['id'],
    uniqueIdentity: ['job_id'],
  },
  {
    name: 'scheduled_actions',
    domain: 'scheduled-action',
    primaryKey: ['id'],
  },
  {
    name: 'scheduled_action_runs',
    domain: 'scheduled-action-run',
    primaryKey: ['id'],
    uniqueIdentity: ['occurrence_key', 'lease_token'],
  },
  {
    name: 'chat_threads',
    domain: 'chat-thread',
    primaryKey: ['id'],
    ownerScoped: true,
  },
  {
    name: 'chat_messages',
    domain: 'chat-message',
    primaryKey: ['id'],
    ownerScoped: true,
    appendOnly: true,
    uniqueIdentity: ['thread_id, turn_id, role'],
  },
];

// Browser-facing roles must keep zero direct table privileges after a
// restore. The application server remains the only supported gateway.
const BROWSER_ROLES = ['anon', 'authenticated'];

const EXPECTED_TRIGGERS = [
  {
    table: 'events',
    name: 'events_append_only',
    function: 'reject_event_mutation()',
    // The event trigger pins its search_path so object resolution cannot be
    // redirected by a caller role.
    pinnedSearchPath: true,
  },
  {
    table: 'chat_messages',
    name: 'chat_messages_append_only',
    function: 'enforce_chat_message_transition()',
    pinnedSearchPath: true,
  },
];

// Uniqueness guarantees whose disappearance would silently break replay
// safety, occurrence identity, or owner scoping after a restore.
const EXPECTED_UNIQUE_CONSTRAINTS = [
  { table: 'jobs', columns: ['job_key'], label: 'jobs.job_key' },
  { table: 'events', columns: ['mutation_id'], label: 'events.mutation_id' },
  {
    table: 'mutation_receipts',
    columns: ['mutation_id'],
    label: 'mutation_receipts.mutation_id',
  },
  {
    table: 'repairs',
    columns: ['job_id'],
    label: 'repairs.job_id (one repair per job)',
  },
  {
    table: 'scheduled_action_runs',
    columns: ['occurrence_key'],
    label: 'scheduled_action_runs.occurrence_key',
  },
  {
    table: 'scheduled_action_runs',
    columns: ['lease_token'],
    label: 'scheduled_action_runs.lease_token',
  },
  {
    table: 'chat_threads',
    columns: ['id', 'owner_id'],
    label: 'chat_threads.(id, owner_id)',
  },
  {
    table: 'chat_messages',
    columns: ['thread_id', 'turn_id', 'role'],
    label: 'chat_messages.(thread_id, turn_id, role)',
  },
];

// Foreign keys that tie the domain graph together. Restore verification
// checks the constraint definitions exist and reference the expected sides.
const EXPECTED_FOREIGN_KEYS = [
  { table: 'jobs', columns: ['party_id'], references: 'parties(id)' },
  { table: 'tasks', columns: ['job_id'], references: 'jobs(id)' },
  { table: 'repairs', columns: ['job_id'], references: 'jobs(id)' },
  { table: 'scheduled_actions', columns: ['job_id'], references: 'jobs(id)' },
  { table: 'scheduled_actions', columns: ['task_id'], references: 'tasks(id)' },
  {
    table: 'scheduled_action_runs',
    columns: ['scheduled_action_id'],
    references: 'scheduled_actions(id)',
  },
  {
    table: 'chat_messages',
    columns: ['thread_id', 'owner_id'],
    references: 'chat_threads(id, owner_id)',
  },
];

const TABLE_NAMES = Object.freeze(EXPECTED_TABLES.map((table) => table.name));
const BROWSER_ROLE_NAMES = Object.freeze([...BROWSER_ROLES]);

function getTableContract(name) {
  return EXPECTED_TABLES.find((table) => table.name === name) ?? null;
}

// Any public table that is not part of this contract is a signal that a new
// migration introduced durable state without extending recovery coverage.
// Recovery must fail loudly in that case rather than skip the new domain.
function isKnownTableName(name) {
  return TABLE_NAMES.includes(name);
}

export {
  EXPECTED_TABLES,
  EXPECTED_TRIGGERS,
  EXPECTED_UNIQUE_CONSTRAINTS,
  EXPECTED_FOREIGN_KEYS,
  BROWSER_ROLE_NAMES,
  TABLE_NAMES,
  getTableContract,
  isKnownTableName,
};
