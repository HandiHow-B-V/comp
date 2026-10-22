import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const adapterOptions = mock((options: unknown) => options);
mock.module('@prisma/adapter-pg', () => ({
  PrismaPg: class {
    constructor(options: unknown) {
      adapterOptions(options);
    }
  },
}));
mock.module('@prisma/client', () => ({
  PrismaClient: class {
    $connect() {
      return Promise.resolve();
    }
  },
}));

const { db } = await import('./client.ts');

describe('shared database private-network TLS opt-out', () => {
  const originalEnv = process.env;
  const originalPrisma = Reflect.get(globalThis, 'prisma');

  beforeEach(() => {
    adapterOptions.mockClear();
    Reflect.deleteProperty(globalThis, 'prisma');
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://comp:example@postgres:5432/comp?sslmode=require',
    };
    delete process.env.PRISMA_DISABLE_TLS;
    delete process.env.PRISMA_ALLOW_INSECURE_TLS;
  });

  afterEach(() => {
    process.env = originalEnv;
    if (originalPrisma === undefined) Reflect.deleteProperty(globalThis, 'prisma');
    else Reflect.set(globalThis, 'prisma', originalPrisma);
  });

  it('preserves verified TLS for a remote database by default', () => {
    void db.$connect;
    expect(adapterOptions).toHaveBeenCalledWith({
      connectionString: 'postgresql://comp:example@postgres:5432/comp',
      ssl: { checkServerIdentity: expect.any(Function) },
    });
  });

  it('honors the explicit opt-out even if sslmode=require was in the URL', () => {
    process.env.PRISMA_DISABLE_TLS = '1';
    void db.$connect;
    expect(adapterOptions).toHaveBeenCalledWith({
      connectionString: 'postgresql://comp:example@postgres:5432/comp',
      ssl: undefined,
    });
  });
});
