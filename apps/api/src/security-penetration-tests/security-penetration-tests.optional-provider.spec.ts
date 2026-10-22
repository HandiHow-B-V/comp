import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BillingEntitlementsService } from '../billing/billing-entitlements.service';
import { PentestCreditsService } from './pentest-credits.service';
import { SecurityPenetrationTestsService } from './security-penetration-tests.service';

jest.mock('@db', () => ({
  db: {
    securityPenetrationTestRun: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: 'org_123' }),
      findMany: jest.fn().mockResolvedValue([{ providerRunId: 'run_123' }]),
    },
  },
}));

describe('optional self-hosted pentest provider', () => {
  const originalEnv = process.env;
  const fetchMock = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockRejectedValue(new Error('Unexpected provider request'));

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MACED_API_KEY;
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
    fetchMock.mockClear();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  function createService() {
    return new SecurityPenetrationTestsService(
      new PentestCreditsService(),
      new BillingEntitlementsService(),
    );
  }

  it('allows the API to start without an unused provider key', () => {
    expect(createService).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects creation before reserving a subscription allowance', async () => {
    const reserve = jest.spyOn(
      BillingEntitlementsService.prototype,
      'tryConsumeIncludedUsageForProduct',
    );
    const debit = jest.spyOn(PentestCreditsService.prototype, 'debitOrThrow');
    await expect(
      createService().createReport('org_123', {
        targetUrl: 'https://example.test',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    expect(reserve).not.toHaveBeenCalled();
    expect(debit).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['list', 'report'])(
    'returns 503 for provider-backed %s requests',
    async (operation) => {
      const service = createService();
      const request =
        operation === 'list'
          ? service.listReports('org_123')
          : service.getReport('org_123', 'run_123');
      await expect(request).rejects.toBeInstanceOf(HttpException);
      await expect(request).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
