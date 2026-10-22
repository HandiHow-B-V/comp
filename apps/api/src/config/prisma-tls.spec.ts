const mockAdapter = jest.fn();
const mockClient = jest.fn().mockReturnValue({ $connect: jest.fn() });
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: mockAdapter }));
jest.mock('@prisma/client', () => ({ PrismaClient: mockClient }));

describe('API private-network PostgreSQL opt-out', () => {
  const originalEnv = process.env;
  const originalPrisma = Reflect.get(global, 'prisma');

  beforeEach(() => {
    jest.resetModules();
    mockAdapter.mockClear();
    mockClient.mockClear();
    Reflect.deleteProperty(global, 'prisma');
    process.env = {
      ...originalEnv,
      DATABASE_URL:
        'postgresql://comp:example@postgres:5432/comp?sslmode=require',
    };
    delete process.env.PRISMA_DISABLE_TLS;
    delete process.env.PRISMA_ALLOW_INSECURE_TLS;
    delete process.env.NODE_EXTRA_CA_CERTS;
  });

  afterEach(() => {
    process.env = originalEnv;
    if (originalPrisma === undefined) Reflect.deleteProperty(global, 'prisma');
    else Reflect.set(global, 'prisma', originalPrisma);
  });

  function initialize() {
    const { db } = jest.requireActual<{
      db: { $connect: () => Promise<void> };
    }>('../../prisma/client.ts');
    return db.$connect;
  }

  it('keeps a remote URL without configured trust from silently downgrading', () => {
    expect(initialize).toThrow('Refusing to connect');
    expect(mockAdapter).not.toHaveBeenCalled();
  });

  it('allows the explicit Docker opt-out and removes conflicting sslmode', () => {
    process.env.PRISMA_DISABLE_TLS = '1';
    initialize();
    expect(mockAdapter).toHaveBeenCalledWith({
      connectionString: 'postgresql://comp:example@postgres:5432/comp',
      ssl: undefined,
    });
  });

  it('keeps remote certificate verification when a CA bundle is configured', () => {
    process.env.NODE_EXTRA_CA_CERTS = '/test/ca.pem';
    initialize();
    expect(mockAdapter).toHaveBeenCalledWith({
      connectionString: 'postgresql://comp:example@postgres:5432/comp',
      ssl: { checkServerIdentity: expect.any(Function) },
    });
  });
});
