import { describe, expect, it } from 'bun:test';
import { resolveSslConfig } from './ssl-config';

describe('self-hosted database TLS configuration', () => {
  const remote = 'postgresql://comp:example@postgres:5432/comp';

  it('disables TLS only with the explicit private-network opt-out', () => {
    expect(resolveSslConfig(remote, { PRISMA_DISABLE_TLS: '1' })).toBeUndefined();
  });

  it('does not mistake other flag values for an opt-out', () => {
    for (const flag of ['0', 'true', '']) {
      expect(resolveSslConfig(remote, { PRISMA_DISABLE_TLS: flag })).toEqual({
        checkServerIdentity: expect.any(Function),
      });
    }
  });

  it('keeps certificate verification on for a remote database by default', () => {
    expect(resolveSslConfig(remote, {})).toEqual({
      checkServerIdentity: expect.any(Function),
    });
  });

  it('keeps the existing localhost development behavior', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(resolveSslConfig(`postgresql://comp:example@${host}/comp`, {})).toBeUndefined();
    }
  });

  it('does not treat malformed or localhost-like remote URLs as local', () => {
    for (const url of ['not a URL', 'postgresql://comp:example@localhost.attacker.test/comp']) {
      expect(resolveSslConfig(url, {})).toEqual({ checkServerIdentity: expect.any(Function) });
    }
  });

  it('preserves the separate explicit unverified-TLS option', () => {
    expect(resolveSslConfig(remote, { PRISMA_ALLOW_INSECURE_TLS: '1' })).toEqual({
      rejectUnauthorized: false,
    });
  });
});
