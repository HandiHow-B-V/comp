jest.mock('../config/load-env', () => ({}));

describe('configured S3 endpoint URLs', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
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

  function extract(value: string) {
    return jest
      .requireActual<{ extractS3KeyFromUrl: (url: string) => string }>('./s3')
      .extractS3KeyFromUrl(value);
  }

  it('accepts the configured endpoint, including its explicit port', () => {
    process.env.APP_AWS_ENDPOINT = 'https://storage.example.test:9443';
    expect(
      extract('https://storage.example.test:9443/org_123/report.pdf'),
    ).toBe('org_123/report.pdf');
  });

  it.each([
    'https://storage.example.test.attacker.test/org_123/report.pdf',
    'https://storage.example.test:9444/org_123/report.pdf',
    'https://attacker.test/org_123/report.pdf',
  ])('rejects a foreign endpoint: %s', (url) => {
    process.env.APP_AWS_ENDPOINT = 'https://storage.example.test:9443';
    expect(() => extract(url)).toThrow('Not a valid S3 endpoint');
  });

  it('preserves AWS endpoints and plain object keys', () => {
    expect(
      extract('https://bucket.s3.eu-west-1.amazonaws.com/org_123/report.pdf'),
    ).toBe('org_123/report.pdf');
    expect(extract('org_123/report.pdf')).toBe('org_123/report.pdf');
  });

  it('rejects traversal keys on a configured endpoint', () => {
    process.env.APP_AWS_ENDPOINT = 'https://storage.example.test';
    expect(() =>
      extract('https://storage.example.test/org_123/%2e%2e%2freport.pdf'),
    ).toThrow('Path traversal');
  });
});
