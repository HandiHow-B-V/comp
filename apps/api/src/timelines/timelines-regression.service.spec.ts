import { TimelinesLifecycleService } from './timelines-lifecycle.service';
import { TimelinesService } from './timelines.service';
import {
  nullableTimestamp,
  type PhaseUpdate,
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

import { getOverviewScores } from '../frameworks/frameworks-scores.helper';

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

function cloneTimeline<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('TimelinesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records regressedAt when a completed AUTO phase drops below 100%', async () => {
    const orgId = 'org_1';
    const lifecycle = {
      activate: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      completePhase: jest.fn(),
    };
    const service = new TimelinesService(
      Object.assign(new TimelinesLifecycleService(), lifecycle),
    );

    const timelineState = {
      id: 'tli_reopen',
      organizationId: orgId,
      frameworkInstanceId: 'fi_1',
      templateId: 'tml_1',
      cycleNumber: 2,
      status: 'ACTIVE',
      startDate: '2026-01-01T00:00:00.000Z',
      pausedAt: null,
      completedAt: nullableTimestamp(),
      phases: [
        {
          id: 'p1',
          name: 'Policies',
          orderIndex: 0,
          status: 'COMPLETED',
          completionType: 'AUTO_POLICIES',
          completedAt: '2026-01-03T00:00:00.000Z',
          regressedAt: null,
        },
      ],
      frameworkInstance: { framework: { id: 'frk_1', name: 'SOC 2' } },
      template: { id: 'tml_1', name: 'SOC 2 Type 2' },
    };

    mockDb.frameworkInstance.findMany.mockResolvedValue([
      {
        id: 'fi_1',
        frameworkId: 'frk_1',
        framework: { id: 'frk_1', name: 'SOC 2' },
        timelineInstances: [{ id: 'tli_reopen' }],
      },
    ]);
    mockDb.timelineInstance.findMany.mockImplementation(() =>
      Promise.resolve([cloneTimeline(timelineState)]),
    );
    mockDb.timelinePhase.update.mockImplementation(
      ({ where, data }: PhaseUpdate) => {
        const phase = timelineState.phases.find((p) => p.id === where.id);
        if (!phase) return null;
        Object.assign(phase, data);
        return phase;
      },
    );
    (getOverviewScores as jest.Mock).mockResolvedValue({
      policies: { total: 10, published: 8 },
      tasks: { total: 1, done: 1 },
      people: { total: 1, completed: 1 },
    });

    await service.reconcileAutoPhasesForOrganization(orgId);
    const result = await service.findAllForOrganization(orgId);

    expect(mockDb.timelinePhase.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { regressedAt: expect.any(Date) },
    });
    expect(result[0].phases[0].status).toBe('COMPLETED');
    expect(result[0].phases[0].regressedAt).toBeTruthy();
  });

  it('re-opens AUTO_PEOPLE immediately when live people score drops below 100%', async () => {
    const orgId = 'org_1';
    const lifecycle = {
      activate: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      completePhase: jest.fn(),
    };
    const service = new TimelinesService(
      Object.assign(new TimelinesLifecycleService(), lifecycle),
    );

    const timelineState = {
      id: 'tli_people_reopen',
      organizationId: orgId,
      frameworkInstanceId: 'fi_1',
      templateId: 'tml_1',
      cycleNumber: 1,
      status: 'ACTIVE',
      lockedAt: null,
      startDate: '2026-01-01T00:00:00.000Z',
      pausedAt: null,
      completedAt: nullableTimestamp(),
      phases: [
        {
          id: 'p1',
          name: 'People',
          orderIndex: 0,
          status: 'COMPLETED',
          completionType: 'AUTO_PEOPLE',
          completedAt: '2026-01-10T00:00:00.000Z',
          regressedAt: null,
          completedById: null,
          readyForReview: false,
          readyForReviewAt: null,
        },
        {
          id: 'p2',
          name: 'Auditor Review',
          orderIndex: 1,
          status: 'PENDING',
          completionType: 'MANUAL',
          completedAt: nullableTimestamp(),
          regressedAt: null,
          completedById: null,
          readyForReview: false,
          readyForReviewAt: null,
        },
      ],
      frameworkInstance: { framework: { id: 'frk_1', name: 'SOC 2' } },
      template: { id: 'tml_1', name: 'SOC 2 Type 1' },
    };

    mockDb.frameworkInstance.findMany.mockResolvedValue([
      {
        id: 'fi_1',
        frameworkId: 'frk_1',
        framework: { id: 'frk_1', name: 'SOC 2' },
        timelineInstances: [{ id: 'tli_people_reopen' }],
      },
    ]);
    mockDb.timelineInstance.findMany.mockImplementation(() =>
      Promise.resolve([cloneTimeline(timelineState)]),
    );

    mockDb.$transaction.mockImplementation((fn: TimelineTransaction) => {
      const tx = {
        timelineInstance: { updateMany: jest.fn() },
        timelinePhase: {
          findMany: jest.fn(() =>
            Promise.resolve(cloneTimeline(timelineState.phases)),
          ),
          update: jest.fn(({ where, data }: PhaseUpdate) => {
            const phase = timelineState.phases.find((p) => p.id === where.id);
            if (!phase) return null;
            Object.assign(phase, data);
            return phase;
          }),
        },
      };
      return fn(tx);
    });

    (getOverviewScores as jest.Mock).mockResolvedValue({
      policies: { total: 10, published: 10 },
      tasks: { total: 1, done: 1 },
      people: { total: 2, completed: 1 },
    });

    await service.reconcileAutoPhasesForOrganization(orgId);
    const result = await service.findAllForOrganization(orgId);

    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(result[0].phases.map((phase) => phase.status)).toEqual([
      'IN_PROGRESS',
      'PENDING',
    ]);
    expect(result[0].phases[0].regressedAt).toBeNull();
  });
});
