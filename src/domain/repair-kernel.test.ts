import { describe, expect, it } from 'vitest';
import { MemoryDomainStore } from '../db/memory/memory-store';
import { DomainKernel } from './kernel';

function makeKernel() {
  const store = new MemoryDomainStore();
  const ids = Array.from(
    { length: 80 },
    (_, index) =>
      `70000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  );
  let idIndex = 0;
  const kernel = new DomainKernel(store, {
    clock: () => '2026-09-24T09:00:00.000Z',
    idGenerator: () => {
      const id = ids[idIndex];
      if (id === undefined) throw new Error('Repair test id pool exhausted');
      idIndex += 1;
      return id;
    },
  });
  return { kernel, store };
}

async function createRepairFixture(kernel: DomainKernel) {
  const job = await kernel.createJob(
    {
      mutationId: 'MUT-repair-job-00001',
      actor: 'operator-ui',
    },
    {
      title: 'Avenge-X regulator repair',
      category: 'ACTIVE',
      partyId: null,
    },
  );
  const repair = await kernel.createRepair(
    {
      mutationId: 'MUT-repair-create-001',
      actor: 'operator-ui',
    },
    {
      jobId: job.id,
      reportedFault: 'Losing pressure overnight',
      serialState: 'UNKNOWN',
      serialValue: null,
      storageLocation: 'Repair shelf A',
    },
  );
  return { job, repair };
}

describe('Repair domain', () => {
  it('runs the repair lifecycle with explicit testing before Ready', async () => {
    const { kernel } = makeKernel();
    const { job, repair } = await createRepairFixture(kernel);

    expect((await kernel.getRepair(repair.id)).warnings).toEqual([
      'SERIAL_UNKNOWN',
    ]);

    const detailed = await kernel.updateRepairDetails(
      {
        mutationId: 'MUT-repair-details-01',
        actor: 'operator-ui',
        expectedRevision: repair.revision,
      },
      repair.id,
      {
        diagnosis: 'Regulator transfer seal leaking',
        currentFinding: 'Leak localized at transfer block',
        serialState: 'KNOWN',
        serialValue: 'AVX-240924',
      },
    );
    expect((await kernel.getRepair(repair.id)).warnings).toEqual([]);

    const diagnosing = await kernel.moveRepairStage(
      {
        mutationId: 'MUT-repair-stage-diag',
        actor: 'operator-ui',
        expectedRevision: detailed.revision,
      },
      repair.id,
      { stage: 'DIAGNOSING' },
    );
    const repairing = await kernel.moveRepairStage(
      {
        mutationId: 'MUT-repair-stage-fix1',
        actor: 'operator-ui',
        expectedRevision: diagnosing.revision,
      },
      repair.id,
      { stage: 'REPAIRING' },
    );
    const testing = await kernel.moveRepairStage(
      {
        mutationId: 'MUT-repair-stage-test1',
        actor: 'operator-ui',
        expectedRevision: repairing.revision,
      },
      repair.id,
      { stage: 'TESTING' },
    );

    const failed = await kernel.recordRepairTest(
      {
        mutationId: 'MUT-repair-test-fail1',
        actor: 'operator-ui',
        expectedRevision: testing.revision,
      },
      repair.id,
      {
        result: 'FAIL',
        detail: 'Pressure still falling',
      },
    );

    await expect(
      kernel.moveRepairStage(
        {
          mutationId: 'MUT-repair-ready-block',
          actor: 'operator-ui',
          expectedRevision: failed.revision,
        },
        repair.id,
        { stage: 'READY' },
      ),
    ).rejects.toThrow('Ready or collected repairs require a passing final test');

    const rework = await kernel.moveRepairStage(
      {
        mutationId: 'MUT-repair-stage-fix2',
        actor: 'operator-ui',
        expectedRevision: failed.revision,
      },
      repair.id,
      { stage: 'REPAIRING' },
    );
    const retest = await kernel.moveRepairStage(
      {
        mutationId: 'MUT-repair-stage-test2',
        actor: 'operator-ui',
        expectedRevision: rework.revision,
      },
      repair.id,
      { stage: 'TESTING' },
    );
    expect(retest.finalTestResult).toBeNull();
    expect(retest.testedAt).toBeNull();

    const passed = await kernel.recordRepairTest(
      {
        mutationId: 'MUT-repair-test-pass1',
        actor: 'operator-ui',
        expectedRevision: retest.revision,
      },
      repair.id,
      {
        result: 'PASS',
        detail: 'Held pressure through final soak',
      },
    );
    const ready = await kernel.moveRepairStage(
      {
        mutationId: 'MUT-repair-stage-ready',
        actor: 'operator-ui',
        expectedRevision: passed.revision,
      },
      repair.id,
      { stage: 'READY' },
    );
    expect(ready.readyAt).not.toBeNull();

    const collected = await kernel.moveRepairStage(
      {
        mutationId: 'MUT-repair-collected1',
        actor: 'operator-ui',
        expectedRevision: ready.revision,
      },
      repair.id,
      { stage: 'COLLECTED' },
    );
    expect(collected.stage).toBe('COLLECTED');
    expect(collected.collectedAt).not.toBeNull();

    await expect(
      kernel.moveRepairStage(
        {
          mutationId: 'MUT-repair-reopen-001',
          actor: 'operator-ui',
          expectedRevision: collected.revision,
        },
        repair.id,
        { stage: 'REPAIRING' },
      ),
    ).rejects.toThrow('Invalid repair stage transition');

    const jobView = await kernel.getJob(job.id);
    expect(jobView.repair?.id).toBe(repair.id);
    expect(jobView.repairWarnings).toEqual([]);
    expect(
      jobView.events.some(
        (event) => event.eventType === 'REPAIR_TEST_RECORDED',
      ),
    ).toBe(true);
    expect(
      jobView.events.some(
        (event) => event.eventType === 'REPAIR_STAGE_CHANGED',
      ),
    ).toBe(true);
  });

  it('requires explicit waiting context and surfaces due repair follow-ups', async () => {
    const { kernel } = makeKernel();
    const { repair } = await createRepairFixture(kernel);

    const diagnosing = await kernel.moveRepairStage(
      {
        mutationId: 'MUT-repair-wait-diag',
        actor: 'operator-ui',
        expectedRevision: repair.revision,
      },
      repair.id,
      { stage: 'DIAGNOSING' },
    );

    await expect(
      kernel.moveRepairStage(
        {
          mutationId: 'MUT-repair-wait-bad1',
          actor: 'operator-ui',
          expectedRevision: diagnosing.revision,
        },
        repair.id,
        {
          stage: 'AWAITING_PARTS',
          waitingOn: 'Supplier seal kit',
        } as never,
      ),
    ).rejects.toThrow('Waiting stage requires followUpAt');

    const waiting = await kernel.moveRepairStage(
      {
        mutationId: 'MUT-repair-wait-good',
        actor: 'operator-ui',
        expectedRevision: diagnosing.revision,
      },
      repair.id,
      {
        stage: 'AWAITING_PARTS',
        waitingOn: 'Supplier seal kit',
        followUpAt: '2026-09-24T08:30:00.000Z',
      },
    );
    expect(waiting.waitingOn).toBe('Supplier seal kit');

    const today = await kernel.getToday('2026-09-24T09:00:00.000Z');
    expect(today.repairs.map((value) => value.id)).toEqual([repair.id]);

    const repairing = await kernel.moveRepairStage(
      {
        mutationId: 'MUT-repair-wait-clear',
        actor: 'operator-ui',
        expectedRevision: waiting.revision,
      },
      repair.id,
      { stage: 'REPAIRING' },
    );
    expect(repairing.waitingOn).toBeNull();
    expect(repairing.followUpAt).toBeNull();
  });

  it('enforces one Repair per Job and rejects terminal Job attachment', async () => {
    const { kernel } = makeKernel();
    const { job, repair } = await createRepairFixture(kernel);

    await expect(
      kernel.createRepair(
        {
          mutationId: 'MUT-repair-duplicate',
          actor: 'operator-ui',
        },
        {
          jobId: job.id,
          reportedFault: 'Second repair should not exist',
          serialState: 'NOT_APPLICABLE',
          serialValue: null,
          storageLocation: null,
        },
      ),
    ).rejects.toThrow('Job already has a repair');

    expect((await kernel.getRepair(repair.id)).repair.jobId).toBe(job.id);

    const terminalJob = await kernel.createJob(
      {
        mutationId: 'MUT-repair-terminal-job',
        actor: 'operator-ui',
      },
      {
        title: 'Closed historical job',
        category: 'DONE',
        partyId: null,
      },
    );

    await expect(
      kernel.createRepair(
        {
          mutationId: 'MUT-repair-terminal-add',
          actor: 'operator-ui',
        },
        {
          jobId: terminalJob.id,
          reportedFault: 'Should be rejected',
          serialState: 'UNKNOWN',
          serialValue: null,
          storageLocation: null,
        },
      ),
    ).rejects.toThrow('Cannot attach a repair to a terminal job');
  });

  it('searches Repair serial, finding, fault, storage, and waiting text', async () => {
    const { kernel } = makeKernel();
    const { repair } = await createRepairFixture(kernel);

    const updated = await kernel.updateRepairDetails(
      {
        mutationId: 'MUT-repair-search-detail',
        actor: 'operator-ui',
        expectedRevision: repair.revision,
      },
      repair.id,
      {
        currentFinding: 'Transfer block seal damaged',
        serialState: 'KNOWN',
        serialValue: 'SER-9911',
        storageLocation: 'Bin R4',
      },
    );

    expect((await kernel.search('SER-9911')).repairs).toHaveLength(1);
    expect((await kernel.search('transfer block')).repairs).toHaveLength(1);
    expect((await kernel.search('bin r4')).repairs).toHaveLength(1);

    const diagnosing = await kernel.moveRepairStage(
      {
        mutationId: 'MUT-repair-search-diag',
        actor: 'operator-ui',
        expectedRevision: updated.revision,
      },
      repair.id,
      { stage: 'DIAGNOSING' },
    );
    await kernel.moveRepairStage(
      {
        mutationId: 'MUT-repair-search-wait',
        actor: 'operator-ui',
        expectedRevision: diagnosing.revision,
      },
      repair.id,
      {
        stage: 'AWAITING_CUSTOMER',
        waitingOn: 'Customer approval',
        followUpAt: '2026-09-25T08:00:00.000Z',
      },
    );

    expect((await kernel.search('customer approval')).repairs).toHaveLength(1);
  });
});
