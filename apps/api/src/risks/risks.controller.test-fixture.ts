import { Test, TestingModule } from '@nestjs/testing';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import type { AuthContext } from '../auth/types';
import { RisksController } from './risks.controller';
import { RisksService } from './risks.service';

// Mock auth.server to avoid importing better-auth ESM in Jest
jest.mock('@db', () => ({
  ...jest.requireActual('@prisma/client'),
  db: {},
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(message: string, { code }: { code: string }) {
        super(message);
        this.code = code;
      }
    },
  },
}));

jest.mock('../auth/auth.server', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock('@trycompai/auth', () => ({
  statement: {
    risk: ['create', 'read', 'update', 'delete'],
  },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

jest.mock('../utils/assignment-filter', () => ({
  buildRiskAssignmentFilter: jest.fn().mockReturnValue({}),
  hasRiskAccess: jest.fn().mockReturnValue(true),
}));

import { RiskCategory } from '@db';
import {
  buildRiskAssignmentFilter,
  hasRiskAccess,
} from '../utils/assignment-filter';

const mockBuildRiskAssignmentFilter =
  buildRiskAssignmentFilter as jest.MockedFunction<
    typeof buildRiskAssignmentFilter
  >;
const mockHasRiskAccess = hasRiskAccess as jest.MockedFunction<
  typeof hasRiskAccess
>;

export function setupRisksControllerTests() {
  let controller: RisksController;
  let risksService: {
    findAllByOrganization: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    getStatsByAssignee: jest.Mock;
    getStatsByDepartment: jest.Mock;
  };

  const orgId = 'org_test123';

  const authContext: AuthContext = {
    organizationId: orgId,
    authType: 'session',
    isApiKey: false,
    isPlatformAdmin: false,
    userRoles: ['admin'],
    userId: 'usr_123',
    userEmail: 'admin@example.com',
    memberId: 'mem_123',
  };

  const authContextNoUser: AuthContext = {
    organizationId: orgId,
    authType: 'api-key',
    isApiKey: true,
    isPlatformAdmin: false,
    userRoles: ['admin'],
    userId: undefined,
    userEmail: undefined,
    memberId: undefined,
  };

  const mockRisk = {
    id: 'risk_1',
    title: 'Test Risk',
    description: 'A test risk',
    status: 'open',
    category: 'operations',
    department: 'engineering',
    organizationId: orgId,
    assigneeId: 'mem_123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockService = {
      findAllByOrganization: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      getStatsByAssignee: jest.fn(),
      getStatsByDepartment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RisksController],
      providers: [{ provide: RisksService, useValue: mockService }],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RisksController>(RisksController);
    risksService = module.get(RisksService);

    jest.clearAllMocks();
    mockBuildRiskAssignmentFilter.mockReturnValue({});
    mockHasRiskAccess.mockReturnValue(true);
  });

  return {
    get controller() {
      return controller;
    },
    get risksService() {
      return risksService;
    },
    orgId,
    authContext,
    authContextNoUser,
    mockRisk,
    RiskCategory,
    mockBuildRiskAssignmentFilter,
    mockHasRiskAccess,
  };
}
