import { describe, expect, it } from 'vitest';
import type { Party } from '../../contracts/party';
import { MemoryDomainStore } from './memory-store';

const party: Party = {
  id: '00000000-0000-4000-8000-000000000099',
  name: 'Rollback Example',
  kind: 'OTHER',
  createdAt: '2026-09-24T09:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
  revision: 1,
};

describe('memory domain store', () => {
  it('rolls back every write when a transaction fails', async () => {
    const store = new MemoryDomainStore();

    await expect(
      store.transact(async (transaction) => {
        await transaction.insertParty(party);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const parties = await store.read(async (read) => await read.listParties());
    expect(parties).toEqual([]);
  });

  it('does not commit state if returning the transaction result fails', async () => {
    const store = new MemoryDomainStore();

    await expect(
      store.transact(async (transaction) => {
        await transaction.insertParty(party);
        return (): void => undefined;
      }),
    ).rejects.toThrow();

    const parties = await store.read(async (read) => await read.listParties());
    expect(parties).toEqual([]);
  });

  it('rejects a second event for the same mutation id', async () => {
    const store = new MemoryDomainStore();
    const firstEvent = {
      id: '00000000-0000-4000-8000-000000000101',
      mutationId: 'MUT-memory-event-001',
      entityType: 'PARTY' as const,
      entityId: party.id,
      eventType: 'PARTY_CREATED' as const,
      actor: 'system' as const,
      occurredAt: '2026-09-24T09:00:00.000Z',
      detail: null,
      changes: {},
      revisionAfter: 1,
    };
    const secondEvent = {
      ...firstEvent,
      id: '00000000-0000-4000-8000-000000000102',
    };

    await expect(
      store.transact(async (transaction) => {
        await transaction.appendEvent(firstEvent);
        await transaction.appendEvent(secondEvent);
      }),
    ).rejects.toThrow('EventMutation');

    const events = await store.read(async (read) => await read.listEvents());
    expect(events).toEqual([]);
  });

  it('returns defensive copies from reads', async () => {
    const store = new MemoryDomainStore();
    await store.transact(async (transaction) => {
      await transaction.insertParty(party);
    });

    const first = await store.read(async (read) => await read.getParty(party.id));
    expect(first).toBeDefined();
    if (first !== undefined) {
      first.name = 'Mutated copy';
    }

    const second = await store.read(async (read) => await read.getParty(party.id));
    expect(second?.name).toBe('Rollback Example');
  });
});
