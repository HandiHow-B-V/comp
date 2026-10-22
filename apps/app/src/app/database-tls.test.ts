import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAdapter, mockClient } = vi.hoisted(() => ({
  mockAdapter: vi.fn(function () {}),
  mockClient: vi.fn(function () {
    return { $connect: vi.fn() };
  }),
}));
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: mockAdapter }));
vi.mock('@prisma/client', () => ({ PrismaClient: mockClient }));

describe('frontend private-network PostgreSQL opt-out', () => {
  const originalEnv = process.env;
  const originalPrisma = Reflect.get(globalThis, 'prisma');

  beforeEach(() => {
    vi.resetModules();
    mockAdapter.mockClear();
    mockClient.mockClear();
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

  async function initialize() {
    const { db } = await vi.importActual<{ db: { $connect: () => Promise<void> } }>(
      '../../prisma/client.ts',
    );
    return db.$connect;
  }

  it('keeps certificate verification enabled for remote databases by default', async () => {
    await initialize();
    expect(mockAdapter).toHaveBeenCalledWith({
      connectionString: 'postgresql://comp:example@postgres:5432/comp',
      ssl: { checkServerIdentity: expect.any(Function) },
    });
  });

  it('disables TLS only when explicitly configured and removes conflicting sslmode', async () => {
    process.env.PRISMA_DISABLE_TLS = '1';
    await initialize();
    expect(mockAdapter).toHaveBeenCalledWith({
      connectionString: 'postgresql://comp:example@postgres:5432/comp',
      ssl: undefined,
    });
  });
});
