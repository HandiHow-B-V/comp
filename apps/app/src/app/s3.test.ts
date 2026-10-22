import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('configured S3 endpoint URLs', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      APP_AWS_REGION: 'eu-test-1',
      APP_AWS_ACCESS_KEY_ID: 'test-access',
      APP_AWS_SECRET_ACCESS_KEY: 'test-secret',
      APP_AWS_BUCKET_NAME: 'test-bucket',
    };
    delete process.env.APP_AWS_ENDPOINT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function extract(value: string) {
    return (await import('./s3')).extractS3KeyFromUrl(value);
  }

  it('accepts the configured endpoint, including its explicit port', async () => {
    process.env.APP_AWS_ENDPOINT = 'https://storage.example.test:9443';
    await expect(extract('https://storage.example.test:9443/org_123/report.pdf')).resolves.toBe(
      'org_123/report.pdf',
    );
  });

  it.each([
    'https://storage.example.test.attacker.test/org_123/report.pdf',
    'https://storage.example.test:9444/org_123/report.pdf',
    'https://attacker.test/org_123/report.pdf',
  ])('rejects a foreign endpoint: %s', async (url) => {
    process.env.APP_AWS_ENDPOINT = 'https://storage.example.test:9443';
    await expect(extract(url)).rejects.toThrow('Not a valid S3 endpoint');
  });

  it('preserves AWS endpoints and plain object keys', async () => {
    await expect(
      extract('https://bucket.s3.eu-west-1.amazonaws.com/org_123/report.pdf'),
    ).resolves.toBe('org_123/report.pdf');
    await expect(extract('org_123/report.pdf')).resolves.toBe('org_123/report.pdf');
  });

  it('rejects traversal keys on a configured endpoint', async () => {
    process.env.APP_AWS_ENDPOINT = 'https://storage.example.test';
    await expect(
      extract('https://storage.example.test/org_123/%2e%2e%2freport.pdf'),
    ).rejects.toThrow('Path traversal');
  });
});
