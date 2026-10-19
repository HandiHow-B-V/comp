jest.mock('@db', () => ({ db: {} }));
jest.mock('../services/connection.service', () => ({
  ConnectionService: class ConnectionService {},
}));
import { Test, TestingModule } from '@nestjs/testing';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { ConnectionRepository } from '../repositories/connection.repository';
import { ProviderRepository } from '../repositories/provider.repository';
import { AutoCheckRunnerService } from '../services/auto-check-runner.service';
import { ConnectionService } from '../services/connection.service';
import { CredentialVaultService } from '../services/credential-vault.service';
import { VariablesController } from './variables.controller';

jest.mock('../../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock('@trycompai/auth', () => ({
  statement: {
    integration: ['create', 'read', 'update', 'delete'],
  },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

jest.mock('@trycompai/integration-platform', () => ({
  getManifest: jest.fn(),
}));

import { getManifest } from '@trycompai/integration-platform';

const mockedGetManifest = getManifest as jest.MockedFunction<
  typeof getManifest
>;

export function setupVariablesControllerTests() {
  let controller: VariablesController;

  const mockConnectionRepository = {
    findById: jest.fn(),
    update: jest.fn(),
  };

  const mockProviderRepository = {
    findById: jest.fn(),
  };

  const mockCredentialVaultService = {
    getDecryptedCredentials: jest.fn(),
  };

  const mockAutoCheckRunnerService = {
    tryAutoRunChecks: jest.fn().mockResolvedValue(false),
  };

  const mockConnectionService = { getConnectionForOrg: jest.fn() };

  const mockGuard = { canActivate: jest.fn().mockReturnValue(true) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VariablesController],
      providers: [
        { provide: ConnectionService, useValue: mockConnectionService },
        { provide: ConnectionRepository, useValue: mockConnectionRepository },
        { provide: ProviderRepository, useValue: mockProviderRepository },
        {
          provide: CredentialVaultService,
          useValue: mockCredentialVaultService,
        },
        {
          provide: AutoCheckRunnerService,
          useValue: mockAutoCheckRunnerService,
        },
      ],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(PermissionGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<VariablesController>(VariablesController);

    jest.resetAllMocks();
    mockConnectionService.getConnectionForOrg.mockResolvedValue(undefined);
    mockAutoCheckRunnerService.tryAutoRunChecks.mockResolvedValue(false);
  });

  return {
    get controller() {
      return controller;
    },
    mockConnectionRepository,
    mockProviderRepository,
    mockCredentialVaultService,
    mockAutoCheckRunnerService,
    mockConnectionService,
    mockedGetManifest,
  };
}
