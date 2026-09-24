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
      store.transact((transaction) => {
        transaction.insertParty(party);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const parties = await store.read((read) => read.listParties());
    expect(parties).toEqual([]);
  });

  it('returns defensive copies from reads', async () => {
    const store = new MemoryDomainStore();
    await store.transact((transaction) => {
      transaction.insertParty(party);
    });

    const first = await store.read((read) => read.getParty(party.id));
    expect(first).toBeDefined();
    if (first !== undefined) {
      first.name = 'Mutated copy';
    }

    const second = await store.read((read) => read.getParty(party.id));
    expect(second?.name).toBe('Rollback Example');
  });
});
