import { BadRequestException } from '@nestjs/common';
import { TimelinesLifecycleService } from './timelines-lifecycle.service';
import { TimelinesService } from './timelines.service';
import { timelineFixture } from './timelines.service.model-fixture';

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

import { createInstanceFromTemplate } from './timelines-template-resolver';

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

  it('rejects starting next cycle when current timeline is not completed', async () => {
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
        frameworkInstanceId: 'fi_1',
        cycleNumber: 1,
        status: 'ACTIVE',
      }),
    );

    await expect(service.startNextCycle('tli_1', 'org_1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects starting next cycle when next cycle already exists', async () => {
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
        frameworkInstanceId: 'fi_1',
        cycleNumber: 2,
        status: 'COMPLETED',
      }),
    );
    mockDb.timelineInstance.findFirst.mockResolvedValue({
      id: 'existing_cycle_3',
    });

    await expect(service.startNextCycle('tli_1', 'org_1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates next cycle from template when eligible', async () => {
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
        frameworkInstanceId: 'fi_1',
        cycleNumber: 2,
        status: 'COMPLETED',
      }),
    );
    mockDb.timelineInstance.findFirst.mockResolvedValue(null);

    const createSpy = jest
      .spyOn(service, 'createFromTemplate')
      .mockResolvedValue(timelineFixture({ id: 'tli_3', cycleNumber: 3 }));

    const result = await service.startNextCycle('tli_1', 'org_1');

    expect(createSpy).toHaveBeenCalledWith({
      organizationId: 'org_1',
      frameworkInstanceId: 'fi_1',
      cycleNumber: 3,
      trackKey: 'primary',
    });
    expect(result).toEqual(
      expect.objectContaining({ id: 'tli_3', cycleNumber: 3 }),
    );
  });

  it('uses explicit template progression when current template defines nextTemplateKey', async () => {
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
        id: 'tli_2',
        frameworkInstanceId: 'fi_1',
        cycleNumber: 2,
        trackKey: 'soc2_type2',
        status: 'COMPLETED',
        template: {
          id: 'tml_soc2_y1',
          frameworkId: 'frk_soc2',
          trackKey: 'soc2_type2',
          templateKey: 'soc2_type2_year1',
          nextTemplateKey: 'soc2_type2_renewal',
        },
      }),
    );

    mockDb.timelineInstance.findFirst.mockResolvedValue(null);
    mockDb.timelineTemplate.findUnique.mockResolvedValue({
      id: 'tml_soc2_renewal',
      phases: [],
    });
    (createInstanceFromTemplate as jest.Mock).mockResolvedValue({
      id: 'tli_3',
      cycleNumber: 3,
    });

    const createSpy = jest
      .spyOn(service, 'createFromTemplate')
      .mockResolvedValue(timelineFixture({ id: 'fallback', cycleNumber: 3 }));

    const result = await service.startNextCycle('tli_2', 'org_1');

    expect(mockDb.timelineTemplate.findUnique).toHaveBeenCalledWith({
      where: {
        frameworkId_templateKey: {
          frameworkId: 'frk_soc2',
          templateKey: 'soc2_type2_renewal',
        },
      },
      include: { phases: { orderBy: { orderIndex: 'asc' } } },
    });
    expect(createSpy).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ id: 'tli_3', cycleNumber: 3 }),
    );
  });

  it('checks for existing next cycle within the same track only', async () => {
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
        id: 'tli_type2_1',
        frameworkInstanceId: 'fi_1',
        cycleNumber: 1,
        trackKey: 'soc2_type2',
        status: 'COMPLETED',
        template: {
          id: 'tml_soc2_type2_y1',
          frameworkId: 'frk_soc2',
          trackKey: 'soc2_type2',
          templateKey: 'soc2_type2_year1',
          nextTemplateKey: 'soc2_type2_renewal',
        },
      }),
    );
    mockDb.timelineInstance.findFirst.mockResolvedValue(null);
    mockDb.timelineTemplate.findUnique.mockResolvedValue({
      id: 'tml_soc2_renewal',
      trackKey: 'soc2_type2',
      phases: [],
    });
    (createInstanceFromTemplate as jest.Mock).mockResolvedValue({
      id: 'tli_type2_2',
      cycleNumber: 2,
      trackKey: 'soc2_type2',
    });

    await service.startNextCycle('tli_type2_1', 'org_1');

    expect(mockDb.timelineInstance.findFirst).toHaveBeenCalledWith({
      where: {
        frameworkInstanceId: 'fi_1',
        trackKey: 'soc2_type2',
        cycleNumber: 2,
      },
    });
  });
});
