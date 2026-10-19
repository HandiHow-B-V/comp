import type { TimelinesService } from './timelines.service';

type Timeline = Awaited<ReturnType<TimelinesService['findOne']>>;
type Phase = Timeline['phases'][number];
type TimelineOverrides = Omit<Partial<Timeline>, 'template' | 'phases'> & {
  template?: Partial<Timeline['template']>;
  phases?: Partial<Phase>[];
};

export interface PhaseUpdate {
  where: { id: string };
  data: Record<string, unknown>;
}

export type TimelineTransaction = (tx: {
  timelinePhase: { update: jest.Mock; findMany?: jest.Mock };
  timelineInstance?: { update?: jest.Mock; updateMany?: jest.Mock };
}) => Promise<unknown>;

export function nullableTimestamp(): string | null {
  return null;
}

export function timelineFixture({
  template,
  phases,
  ...overrides
}: TimelineOverrides = {}): Timeline {
  const date = new Date('2026-01-01');
  return {
    id: 'tli_1',
    organizationId: 'org_1',
    frameworkInstanceId: 'fi_1',
    templateId: 'tml_1',
    trackKey: 'primary',
    cycleNumber: 1,
    status: 'ACTIVE',
    startDate: null,
    pausedAt: null,
    lockedAt: null,
    lockedById: null,
    unlockedAt: null,
    unlockedById: null,
    unlockReason: null,
    completedAt: null,
    createdAt: date,
    updatedAt: date,
    frameworkInstance: {
      id: 'fi_1',
      organizationId: 'org_1',
      frameworkId: 'frk_1',
      customFrameworkId: null,
      currentVersionId: null,
      framework: null,
    },
    template: {
      id: 'tml_1',
      frameworkId: 'frk_1',
      name: 'Test framework',
      trackKey: 'primary',
      cycleNumber: 1,
      templateKey: null,
      nextTemplateKey: null,
      createdAt: date,
      updatedAt: date,
      phases: [],
      ...template,
    },
    phases: (phases ?? []).map((phase) => ({
      id: 'p1',
      instanceId: 'tli_1',
      phaseTemplateId: null,
      name: 'Test phase',
      description: null,
      groupLabel: null,
      orderIndex: 0,
      status: 'PENDING',
      startDate: null,
      endDate: null,
      durationWeeks: 1,
      completionType: 'MANUAL',
      locksTimelineOnComplete: false,
      regressedAt: null,
      datesPinned: false,
      completedAt: null,
      completedById: null,
      completedBy: null,
      readyForReview: false,
      readyForReviewAt: null,
      documentUrl: null,
      documentName: null,
      createdAt: date,
      updatedAt: date,
      ...phase,
    })),
    ...overrides,
  };
}
