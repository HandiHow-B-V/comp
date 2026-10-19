jest.mock('../attachments/attachments.service', () => ({
  AttachmentsService: class AttachmentsService {},
}));

const transactionDb = {
  offboardingChecklistTemplate: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
  },
  offboardingChecklistCompletion: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  offboardingAccessRevocation: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  vendor: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  member: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  attachment: {
    findMany: jest.fn(),
  },
};

const mockDb = {
  ...transactionDb,
  $transaction: jest.fn((fn: (tx: typeof transactionDb) => Promise<unknown>) =>
    fn(transactionDb),
  ),
};

jest.mock('@db', () => ({
  db: mockDb,
  AttachmentEntityType: {
    offboarding_checklist: 'offboarding_checklist',
  },
}));

import { AccessRevocationService } from './access-revocation.service';
import { DEFAULT_OFFBOARDING_CHECKLIST_ITEMS } from './default-checklist-items';
import { OffboardingChecklistService } from './offboarding-checklist.service';

export function setupOffboardingChecklistTests() {
  const mockAttachmentsService = {
    getAttachments: jest.fn(),
    uploadAttachment: jest.fn(),
    deleteAttachment: jest.fn(),
    getPresignedDownloadUrl: jest
      .fn()
      .mockResolvedValue('https://signed-url.example.com'),
  };

  let service: OffboardingChecklistService;
  let accessRevocationService: AccessRevocationService;

  beforeEach(() => {
    jest.clearAllMocks();
    accessRevocationService = new AccessRevocationService(
      mockAttachmentsService as never,
    );
    service = new OffboardingChecklistService(
      mockAttachmentsService as never,
      accessRevocationService,
    );
  });

  return {
    get service() {
      return service;
    },
    mockDb,
    mockAttachmentsService,
    DEFAULT_OFFBOARDING_CHECKLIST_ITEMS,
  };
}
