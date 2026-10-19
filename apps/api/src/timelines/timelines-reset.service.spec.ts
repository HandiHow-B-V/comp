import { TimelinesLifecycleService } from './timelines-lifecycle.service';
import { TimelinesService } from './timelines.service';
import {
  nullableTimestamp,
  timelineFixture,
  type TimelineTransaction,
} from './timelines.service.model-fixture';

jest.mock('@db', () => ({
  db: {
    frameworkInstance: {
      findMany: jest.fn(),
    },
    timelineInstance: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    timelineTemplate: {
      findUnique: jest.fn(),
    },
    timelinePhase: {
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
  TimelinePhaseStatus: {
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
  },
}));

jest.mock('../frameworks/frameworks-scores.helper', () => ({
  getOverviewScores: jest.fn(),
}));

jest.mock('./timelines-backfill.helper', () => ({
  backfillTimeline: jest.fn(),
}));

jest.mock('./timelines-template-resolver', () => ({
  resolveTemplate: jest.fn(),
  createInstanceFromTemplate: jest.fn(),
}));

import { backfillTimeline } from './timelines-backfill.helper';

const { db: mockDb } = jest.requireMock<{
  db: {
    frameworkInstance: { findMany: jest.Mock };
    timelineInstance: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    timelineTemplate: { findUnique: jest.Mock };
    timelinePhase: { update: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
}>('@db');

describe('TimelinesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resets timeline instance and phases back to draft baseline', async () => {
    const lifecycle = {
      activate: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      completePhase: jest.fn(),
    };
    const service = new TimelinesService(
      Object.assign(new TimelinesLifecycleService(), lifecycle),
    );

    jest.spyOn(service, 'findOne').mockResolvedValue(
      timelineFixture({
        id: 'tli_1',
        phases: [{ id: 'p1' }, { id: 'p2' }],
      }),
    );

    const tx = {
      timelinePhase: { update: jest.fn() },
      timelineInstance: { update: jest.fn() },
    };
    mockDb.$transaction.mockImplementation((fn: TimelineTransaction) => fn(tx));

    const refreshed = timelineFixture({ id: 'tli_1', status: 'DRAFT' });
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValueOnce(
        timelineFixture({
          id: 'tli_1',
          phases: [{ id: 'p1' }, { id: 'p2' }],
        }),
      )
      .mockResolvedValueOnce(refreshed);

    const result = await service.resetInstance('tli_1', 'org_1');

    expect(tx.timelinePhase.update).toHaveBeenCalledTimes(2);
    expect(tx.timelinePhase.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ regressedAt: null }),
    });
    expect(tx.timelineInstance.update).toHaveBeenCalledWith({
      where: { id: 'tli_1' },
      data: {
        status: 'DRAFT',
        startDate: null,
        pausedAt: null,
        lockedAt: null,
        lockedById: null,
        unlockedAt: null,
        unlockedById: null,
        unlockReason: null,
        completedAt: nullableTimestamp(),
      },
    });
    expect(result).toEqual(refreshed);
  });

  it('recreate clears grace periods by bypassing regression grace on refresh', async () => {
    const lifecycle = {
      activate: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      completePhase: jest.fn(),
    };
    const service = new TimelinesService(
      Object.assign(new TimelinesLifecycleService(), lifecycle),
    );

    mockDb.timelineInstance.findMany.mockResolvedValue([{ id: 'tli_1' }]);
    mockDb.frameworkInstance.findMany.mockResolvedValue([
      {
        id: 'fi_1',
        frameworkId: 'frk_1',
        framework: { id: 'frk_1', name: 'SOC 2' },
        timelineInstances: [],
      },
    ]);

    const reconcileSpy = jest
      .spyOn(service, 'reconcileAutoPhasesForOrganization')
      .mockResolvedValue();
    const findAllSpy = jest
      .spyOn(service, 'findAllForOrganization')
      .mockResolvedValue([]);

    await service.recreateAllForOrganization('org_1');

    expect(backfillTimeline).toHaveBeenCalledWith({
      organizationId: 'org_1',
      frameworkInstance: expect.objectContaining({ id: 'fi_1' }),
      forceRefresh: true,
    });
    expect(findAllSpy).toHaveBeenLastCalledWith('org_1');
    expect(reconcileSpy).toHaveBeenLastCalledWith('org_1', {
      bypassRegressionGrace: true,
    });
  });
});
