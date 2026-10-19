import { Test, TestingModule } from '@nestjs/testing';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { CheckRunRepository } from '../repositories/check-run.repository';
import { ConnectionRepository } from '../repositories/connection.repository';
import { DynamicIntegrationRepository } from '../repositories/dynamic-integration.repository';
import { CredentialVaultService } from '../services/credential-vault.service';
import { GenericDeviceSyncService } from '../services/generic-device-sync.service';
import { GenericEmployeeSyncService } from '../services/generic-employee-sync.service';
import { IntegrationSyncLoggerService } from '../services/integration-sync-logger.service';
import { OAuthCredentialsService } from '../services/oauth-credentials.service';
import { SyncController } from './sync.controller';

jest.mock('@db', () => ({
  db: {
    integrationProvider: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
    member: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock('@trycompai/auth', () => ({
  statement: { integration: ['create', 'read', 'update', 'delete'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

jest.mock('@trycompai/integration-platform', () => {
  const actual = jest.requireActual<
    typeof import('@trycompai/integration-platform')
  >('@trycompai/integration-platform');
  return {
    ...actual,
    getManifest: jest.fn().mockReturnValue({
      auth: { type: 'oauth2', config: { tokenUrl: '', refreshUrl: '' } },
    }),
    TASK_TEMPLATE_INFO: {},
  };
});

const mockFetch = jest.fn();
jest.spyOn(globalThis, 'fetch').mockImplementation(mockFetch);

const { db: mockedDb } = jest.requireMock<{
  db: {
    integrationProvider: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock; create: jest.Mock };
    member: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
}>('@db');

interface GwUser {
  primaryEmail: string;
  name: { fullName: string };
  suspended?: boolean;
  orgUnitPath?: string;
}

interface MockMember {
  id: string;
  userId: string;
  organizationId: string;
  deactivated: boolean;
  isActive: boolean;
  role: string;
  user: { email: string };
}

export function setupGoogleWorkspaceSyncTests() {
  let controller: SyncController;
  let mockConnectionRepo: {
    findById: jest.Mock;
    findBySlugAndOrg: jest.Mock;
    update: jest.Mock;
  };
  let mockCredentialVault: jest.Mocked<CredentialVaultService>;
  let mockOAuthCredentials: jest.Mocked<OAuthCredentialsService>;

  const orgId = 'org_test123';
  const connectionId = 'conn_test123';

  beforeEach(async () => {
    mockConnectionRepo = {
      findById: jest.fn(),
      findBySlugAndOrg: jest.fn(),
      update: jest.fn(),
    };

    mockCredentialVault = {
      getDecryptedCredentials: jest.fn(),
      refreshOAuthTokens: jest.fn(),
    } as unknown as jest.Mocked<CredentialVaultService>;

    mockOAuthCredentials = {
      getCredentials: jest.fn(),
    } as unknown as jest.Mocked<OAuthCredentialsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        { provide: ConnectionRepository, useValue: mockConnectionRepo },
        { provide: CredentialVaultService, useValue: mockCredentialVault },
        { provide: OAuthCredentialsService, useValue: mockOAuthCredentials },
        {
          provide: IntegrationSyncLoggerService,
          useValue: { logSync: jest.fn() },
        },
        { provide: GenericEmployeeSyncService, useValue: {} },
        { provide: GenericDeviceSyncService, useValue: {} },
        { provide: DynamicIntegrationRepository, useValue: {} },
        { provide: CheckRunRepository, useValue: {} },
      ],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SyncController>(SyncController);
    jest.clearAllMocks();
  });

  function setupSync({
    gwUsers,
    variables = {},
  }: {
    gwUsers: GwUser[];
    variables?: Record<string, unknown>;
  }) {
    mockConnectionRepo.findById.mockResolvedValue({
      id: connectionId,
      organizationId: orgId,
      providerId: 'prov_1',
      variables,
    });

    mockedDb.integrationProvider.findUnique.mockResolvedValue({
      id: 'prov_1',
      slug: 'google-workspace',
    });

    mockCredentialVault.getDecryptedCredentials.mockResolvedValue({
      access_token: 'test-token',
      refresh_token: 'test-refresh',
    });

    mockOAuthCredentials.getCredentials.mockResolvedValue({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      scopes: [],
      source: 'platform',
    });

    mockCredentialVault.refreshOAuthTokens.mockResolvedValue('new-token');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ users: gwUsers }),
    });
  }

  function makeGwUser(
    email: string,
    opts: { suspended?: boolean; orgUnitPath?: string } = {},
  ): GwUser {
    return {
      primaryEmail: email,
      name: { fullName: email.split('@')[0] },
      suspended: opts.suspended ?? false,
      orgUnitPath: opts.orgUnitPath ?? '/',
    };
  }

  function makeMember(
    email: string,
    opts: {
      id?: string;
      userId?: string;
      deactivated?: boolean;
      role?: string;
    } = {},
  ): MockMember {
    const id = opts.id ?? `mem_${email.split('@')[0]}`;
    return {
      id,
      userId: opts.userId ?? `user_${email.split('@')[0]}`,
      organizationId: orgId,
      deactivated: opts.deactivated ?? false,
      isActive: !(opts.deactivated ?? false),
      role: opts.role ?? 'employee',
      user: { email },
    };
  }

  // ── Import & Skip ──────────────────────────────────────────────

  return {
    get controller() {
      return controller;
    },
    get mockConnectionRepo() {
      return mockConnectionRepo;
    },
    get mockCredentialVault() {
      return mockCredentialVault;
    },
    get mockOAuthCredentials() {
      return mockOAuthCredentials;
    },
    mockedDb,
    orgId,
    connectionId,
    setupSync,
    makeGwUser,
    makeMember,
  };
}
