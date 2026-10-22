import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailProvider } from './email-provider.types';
import { sendEmailWithProvider, type SendEmailParams } from './send-email';

const send = vi.fn<EmailProvider['emails']['send']>();
const batchSend = vi.fn<EmailProvider['batch']['send']>();
const provider: EmailProvider = { emails: { send }, batch: { send: batchSend } };
const input = { to: 'ada@example.com', subject: 'Hello', react: createElement('p', null, 'Hello') };
const channels: Array<{ suffix: string; flags: Pick<SendEmailParams, 'marketing' | 'system'> }> = [
  { suffix: 'DEFAULT', flags: {} },
  { suffix: 'SYSTEM', flags: { system: true } },
  { suffix: 'MARKETING', flags: { marketing: true } },
];

beforeEach(() => {
  for (const prefix of ['BREVO', 'RESEND']) {
    for (const field of [
      'FROM_DEFAULT',
      'FROM_SYSTEM',
      'FROM_MARKETING',
      'TO_TEST',
      'REPLY_TO_MARKETING',
    ])
      vi.stubEnv(`${prefix}_${field}`, undefined);
  }
  send.mockReset().mockResolvedValue({ data: { id: 'message-1' }, error: null });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('self-hosted email senders', () => {
  it.each(channels)(
    'prefers the Brevo $suffix sender while keeping recipient and flags',
    async ({ suffix, flags }) => {
      vi.stubEnv(`BREVO_FROM_${suffix}`, 'brevo@example.com');
      vi.stubEnv(`RESEND_FROM_${suffix}`, 'resend@example.com');
      expect(await sendEmailWithProvider({ provider, ...input, ...flags })).toEqual({
        message: 'Email sent successfully',
        id: 'message-1',
      });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'brevo@example.com', to: input.to }),
      );
    },
  );

  it('falls back to the existing Resend sender', async () => {
    vi.stubEnv('RESEND_FROM_DEFAULT', 'legacy@example.com');
    await sendEmailWithProvider({ provider, ...input });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: 'legacy@example.com' }));
  });

  it('uses the marketing reply address and test recipient without losing attachments or scheduling', async () => {
    vi.stubEnv('BREVO_FROM_MARKETING', 'marketing@example.com');
    vi.stubEnv('BREVO_REPLY_TO_MARKETING', 'reply@example.com');
    vi.stubEnv('BREVO_TO_TEST', 'test@example.com');
    vi.stubEnv('RESEND_TO_TEST', 'old-test@example.com');
    const attachments = [
      { filename: 'report.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' },
    ];
    await sendEmailWithProvider({
      provider,
      ...input,
      marketing: true,
      test: true,
      cc: ['cc@example.com'],
      scheduledAt: '2026-10-23T09:00:00Z',
      attachments,
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'marketing@example.com',
        to: 'test@example.com',
        replyTo: 'reply@example.com',
        cc: ['cc@example.com'],
        scheduledAt: '2026-10-23T09:00:00Z',
        attachments,
      }),
    );
  });

  it('does not send with a missing sender', async () => {
    await expect(sendEmailWithProvider({ provider, ...input })).rejects.toThrow(
      'Missing FROM address',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('does not accidentally use the real recipient when a test recipient is missing', async () => {
    vi.stubEnv('BREVO_FROM_DEFAULT', 'sender@example.com');
    await expect(sendEmailWithProvider({ provider, ...input, test: true })).rejects.toThrow(
      'Missing TO address',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('does not report delivery without a configured provider', async () => {
    await expect(sendEmailWithProvider({ provider: null, ...input })).rejects.toThrow(
      'Email provider not initialized',
    );
  });

  it('surfaces provider errors to callers', async () => {
    vi.stubEnv('BREVO_FROM_DEFAULT', 'sender@example.com');
    send.mockResolvedValueOnce({ data: null, error: { message: 'Rejected sender' } });
    await expect(sendEmailWithProvider({ provider, ...input })).rejects.toThrow(
      'Failed to send email: Rejected sender',
    );
  });

  it('masks recipient addresses in delivery logs', async () => {
    vi.stubEnv('BREVO_FROM_DEFAULT', 'sender@example.com');
    await sendEmailWithProvider({ provider, ...input });
    expect(console.info).toHaveBeenCalledWith(
      '[email] send start',
      expect.objectContaining({ to: 'a*a@example.com' }),
    );
  });
});
