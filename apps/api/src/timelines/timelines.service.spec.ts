import { TimelinesLifecycleService } from './timelines-lifecycle.service';
import { TimelinesService } from './timelines.service';
import { nullableTimestamp } from './timelines.service.model-fixture';

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

  it('cascades AUTO_* phase completions when live metrics are already 100%', async () => {
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
      id: 'tli_1',
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
          status: 'IN_PROGRESS',
          completionType: 'AUTO_POLICIES',
          completedAt: nullableTimestamp(),
        },
        {
          id: 'p2',
          name: 'Evidence',
          orderIndex: 1,
          status: 'PENDING',
          completionType: 'AUTO_TASKS',
          completedAt: nullableTimestamp(),
        },
        {
          id: 'p3',
          name: 'People',
          orderIndex: 2,
          status: 'PENDING',
          completionType: 'AUTO_PEOPLE',
          completedAt: nullableTimestamp(),
        },
        {
          id: 'p4',
          name: 'Auditor Review',
          orderIndex: 3,
          status: 'PENDING',
          completionType: 'MANUAL',
          completedAt: nullableTimestamp(),
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
        timelineInstances: [{ id: 'tli_1' }],
      },
    ]);

    mockDb.timelineInstance.findMany.mockImplementation(() =>
      Promise.resolve([cloneTimeline(timelineState)]),
    );

    (getOverviewScores as jest.Mock).mockResolvedValue({
      policies: { total: 10, published: 10 },
      tasks: { total: 20, done: 20 },
      people: { total: 5, completed: 5 },
    });

    lifecycle.completePhase.mockImplementation(
      (_instanceId: string, phaseId: string) => {
        const phase = timelineState.phases.find((p) => p.id === phaseId);
        if (!phase) return cloneTimeline(timelineState);

        phase.status = 'COMPLETED';
        phase.completedAt = '2026-01-10T00:00:00.000Z';

        const nextPending = timelineState.phases.find(
          (p) => p.status === 'PENDING',
        );
        if (nextPending) {
          const allPriorComplete = timelineState.phases
            .filter((p) => p.orderIndex < nextPending.orderIndex)
            .every((p) => p.status === 'COMPLETED');

          if (allPriorComplete) {
            nextPending.status = 'IN_PROGRESS';
          }
        }

        return cloneTimeline(timelineState);
      },
    );

    await service.reconcileAutoPhasesForOrganization(orgId);
    const result = await service.findAllForOrganization(orgId);

    expect(lifecycle.completePhase).toHaveBeenCalledTimes(3);
    expect(result[0].phases.map((p) => p.status)).toEqual([
      'COMPLETED',
      'COMPLETED',
      'COMPLETED',
      'IN_PROGRESS',
    ]);
  });

  it('does not auto-complete AUTO phases while a timeline is paused', async () => {
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
      id: 'tli_paused',
      organizationId: orgId,
      frameworkInstanceId: 'fi_1',
      templateId: 'tml_1',
      cycleNumber: 2,
      status: 'PAUSED',
      startDate: '2026-01-01T00:00:00.000Z',
      pausedAt: '2026-01-10T00:00:00.000Z',
      completedAt: nullableTimestamp(),
      phases: [
        {
          id: 'p1',
          name: 'Policies',
          orderIndex: 0,
          status: 'IN_PROGRESS',
          completionType: 'AUTO_POLICIES',
          completedAt: nullableTimestamp(),
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
        timelineInstances: [{ id: 'tli_paused' }],
      },
    ]);
    mockDb.timelineInstance.findMany.mockImplementation(() =>
      Promise.resolve([cloneTimeline(timelineState)]),
    );
    (getOverviewScores as jest.Mock).mockResolvedValue({
      policies: { total: 10, published: 10 },
      tasks: { total: 1, done: 1 },
      people: { total: 1, completed: 1 },
    });

    await service.reconcileAutoPhasesForOrganization(orgId);
    const result = await service.findAllForOrganization(orgId);

    expect(lifecycle.completePhase).not.toHaveBeenCalled();
    expect(result[0].phases[0].status).toBe('IN_PROGRESS');
  });
});
