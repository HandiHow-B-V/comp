import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrevoProvider } from './brevo';

const fetchMock = vi.fn<typeof fetch>();
const payload = {
  from: 'HandiHow <sender@example.com>',
  to: 'ada@example.com',
  subject: 'Hello',
  html: '<p>Hello</p>',
};

beforeEach(() => {
  vi.stubEnv('BREVO_API_KEY', 'test-key');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockResolvedValue(Response.json({ messageId: 'message-1' }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Brevo provider', () => {
  it('sends addresses, scheduling, unsubscribe headers and binary attachments correctly', async () => {
    const result = await createBrevoProvider().emails.send({
      ...payload,
      to: ['Ada <ada@example.com>', 'bob@example.com'],
      cc: 'one@example.com, two@example.com',
      replyTo: 'Support <support@example.com>',
      scheduledAt: '2026-10-23T09:00:00Z',
      headers: { 'List-Unsubscribe': '<https://example.com/unsubscribe>' },
      attachments: [{ filename: 'report.pdf', content: Buffer.from('PDF content') }],
    });
    expect(result).toEqual({ data: { id: 'message-1' }, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': 'test-key',
          'content-type': 'application/json',
        },
      }),
    );
    const body: unknown = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      sender: { name: 'HandiHow', email: 'sender@example.com' },
      to: [{ name: 'Ada', email: 'ada@example.com' }, { email: 'bob@example.com' }],
      cc: [{ email: 'one@example.com' }, { email: 'two@example.com' }],
      replyTo: { name: 'Support', email: 'support@example.com' },
      subject: 'Hello',
      htmlContent: '<p>Hello</p>',
      headers: { 'List-Unsubscribe': '<https://example.com/unsubscribe>' },
      scheduledAt: '2026-10-23T09:00:00Z',
      attachment: [{ name: 'report.pdf', content: Buffer.from('PDF content').toString('base64') }],
    });
  });

  it('keeps queue-serialized base64 attachments intact', async () => {
    const content = Buffer.from([0, 255, 127, 1]).toString('base64');
    await createBrevoProvider().emails.send({
      ...payload,
      attachments: [{ filename: 'binary.bin', content }],
    });
    const body: unknown = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual(
      expect.objectContaining({ attachment: [{ name: 'binary.bin', content }] }),
    );
  });

  it('renders React content when HTML is absent', async () => {
    await createBrevoProvider().emails.send({
      ...payload,
      html: undefined,
      react: createElement('p', null, 'Rendered content'),
    });
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('Rendered content');
  });

  it('does not send without an API key or content', async () => {
    const provider = createBrevoProvider();
    vi.stubEnv('BREVO_API_KEY', undefined);
    expect(await provider.emails.send(payload)).toEqual({
      data: null,
      error: { message: 'Brevo not initialized - missing API key' },
    });
    vi.stubEnv('BREVO_API_KEY', 'test-key');
    expect(await provider.emails.send({ ...payload, html: undefined })).toEqual({
      data: null,
      error: { message: 'Missing email html or react content' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a provider error and never treats it as a sent message', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ message: 'Invalid sender' }, { status: 400 }));
    expect(await createBrevoProvider().emails.send(payload)).toEqual({
      data: null,
      error: { message: 'Invalid sender' },
    });
  });

  it('handles malformed provider error bodies safely', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>Gateway unavailable</html>', { status: 502 }),
    );
    expect(await createBrevoProvider().emails.send(payload)).toEqual({
      data: null,
      error: { message: 'Brevo API request failed with status 502' },
    });
  });

  it('does not expose arbitrary response objects as error text or message IDs', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ message: { nested: 'error' } }, { status: 400 }),
    );
    expect(await createBrevoProvider().emails.send(payload)).toEqual({
      data: null,
      error: { message: 'Brevo API request failed with status 400' },
    });
    fetchMock.mockResolvedValueOnce(Response.json({ messageId: 123 }));
    expect(await createBrevoProvider().emails.send(payload)).toEqual({
      data: { id: undefined },
      error: null,
    });
  });

  it('counts partial batch failures at the original recipient index', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ messageId: 'first' }))
      .mockResolvedValueOnce(Response.json({ message: 'Rejected' }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ messageId: 'third' }));
    expect(await createBrevoProvider().batch.send([payload, payload, payload])).toEqual({
      data: {
        data: [{ id: 'first' }, { id: 'third' }],
        errors: [{ index: 1, message: 'Rejected' }],
      },
      error: null,
    });
  });

  it('propagates network failures instead of reporting success', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(createBrevoProvider().emails.send(payload)).rejects.toThrow('Network unavailable');
  });
});
