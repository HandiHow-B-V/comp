import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmailProvider } from './email-provider';
import type { EmailBatchResult, EmailSendResult, SendEmailPayload } from './email-provider.types';

const send = vi.fn<(payload: SendEmailPayload) => Promise<EmailSendResult>>();
const sendBatch =
  vi.fn<
    (params: {
      payloads: SendEmailPayload[];
      options?: { batchValidation: 'permissive' };
    }) => Promise<EmailBatchResult>
  >();
const fetchMock = vi.fn<typeof fetch>();
const payload = {
  from: 'sender@example.com',
  to: 'ada@example.com',
  subject: 'Hello',
  html: '<p>Hello</p>',
};
const resendTransport = { send, sendBatch };

beforeEach(() => {
  vi.stubEnv('BREVO_API_KEY', undefined);
  vi.stubGlobal('fetch', fetchMock);
  send.mockReset().mockResolvedValue({ data: { id: 'resend-message' }, error: null });
  sendBatch
    .mockReset()
    .mockResolvedValue({ data: { data: [{ id: 'resend-message' }] }, error: null });
  fetchMock.mockReset().mockResolvedValue(Response.json({ messageId: 'brevo-message' }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('email provider selection', () => {
  it('uses Brevo before Resend when both are configured', async () => {
    vi.stubEnv('BREVO_API_KEY', 'test-key');
    const provider = createEmailProvider({ resendTransport });
    expect(await provider?.emails.send(payload)).toEqual({
      data: { id: 'brevo-message' },
      error: null,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('uses Resend when Brevo is absent', async () => {
    expect(await createEmailProvider({ resendTransport })?.emails.send(payload)).toEqual({
      data: { id: 'resend-message' },
      error: null,
    });
    expect(send).toHaveBeenCalledWith(payload);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is unconfigured when neither provider is available', () => {
    expect(createEmailProvider({ resendTransport: null })).toBeNull();
  });

  it('passes rendered HTML to either supported Resend SDK version', async () => {
    await createEmailProvider({ resendTransport })?.emails.send({
      ...payload,
      html: undefined,
      react: createElement('p', null, 'Rendered React'),
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining('Rendered React') }),
    );
    expect(send.mock.calls[0]?.[0]).not.toHaveProperty('react');
  });

  it('preserves the API SDK permissive batch option', async () => {
    const options = { batchValidation: 'permissive' } satisfies { batchValidation: 'permissive' };
    await createEmailProvider({ resendTransport })?.batch.send([payload], options);
    expect(sendBatch).toHaveBeenCalledWith({ payloads: [payload], options });
  });
});
