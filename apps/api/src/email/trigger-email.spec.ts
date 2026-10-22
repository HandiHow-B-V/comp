const triggerMock = jest.fn();
const renderMock = jest.fn();
const sendEmailMock = jest.fn();

jest.mock('@trigger.dev/sdk', () => ({
  tasks: {
    trigger: (...args: unknown[]) => triggerMock(...args),
  },
}));

jest.mock('@react-email/render', () => ({
  render: (...args: unknown[]) => renderMock(...args),
}));

jest.mock('./resend', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

import { createElement } from 'react';
import { triggerEmail } from './trigger-email';

describe('triggerEmail', () => {
  const originalEnv = process.env;
  const react = createElement('p', null, 'Hello');

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.EMAIL_DELIVERY_MODE;
    delete process.env.NEXT_PUBLIC_SELF_HOSTED;
    delete process.env.TRIGGER_SECRET_KEY;
    renderMock.mockResolvedValue('<p>Hello</p>');
    sendEmailMock.mockResolvedValue({ id: 'email_123' });
    triggerMock.mockResolvedValue({ id: 'run_123' });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('sends directly when self-hosted', async () => {
    process.env.NEXT_PUBLIC_SELF_HOSTED = 'true';

    await expect(
      triggerEmail({
        to: 'ada@example.com',
        subject: 'Login to Comp AI',
        react,
      }),
    ).resolves.toEqual({ id: 'email_123' });

    expect(sendEmailMock).toHaveBeenCalledWith({
      to: 'ada@example.com',
      subject: 'Login to Comp AI',
      react,
      marketing: undefined,
      system: undefined,
      cc: undefined,
      scheduledAt: undefined,
      attachments: undefined,
    });
    expect(triggerMock).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
  });

  it('sends directly when Trigger is not configured', async () => {
    await triggerEmail({
      to: 'ada@example.com',
      subject: 'Login to Comp AI',
      react,
      system: true,
    });

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@example.com',
        subject: 'Login to Comp AI',
        system: true,
      }),
    );
    expect(triggerMock).not.toHaveBeenCalled();
  });

  it('queues through Trigger when configured for hosted delivery', async () => {
    process.env.TRIGGER_SECRET_KEY = 'tr_secret';

    await expect(
      triggerEmail({
        to: 'ada@example.com',
        subject: 'Queued email',
        react,
        marketing: true,
      }),
    ).resolves.toEqual({ id: 'run_123' });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(renderMock).toHaveBeenCalledWith(react);
    expect(triggerMock).toHaveBeenCalledWith('send-email', {
      to: 'ada@example.com',
      subject: 'Queued email',
      html: '<p>Hello</p>',
      channel: 'marketing',
      cc: undefined,
      scheduledAt: undefined,
      attachments: undefined,
    });
  });

  it('queues through Trigger when self-hosted explicitly opts into Trigger', async () => {
    process.env.EMAIL_DELIVERY_MODE = 'trigger';
    process.env.NEXT_PUBLIC_SELF_HOSTED = 'true';
    process.env.TRIGGER_SECRET_KEY = 'tr_secret';

    await triggerEmail({
      to: 'ada@example.com',
      subject: 'Queued email',
      react,
      system: true,
    });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(triggerMock).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({
        to: 'ada@example.com',
        subject: 'Queued email',
        channel: 'system',
      }),
    );
  });
  it('honors explicit direct delivery even when Trigger is configured', async () => {
    process.env.EMAIL_DELIVERY_MODE = 'direct';
    process.env.TRIGGER_SECRET_KEY = 'tr_secret';
    const attachments = [{ filename: 'test.pdf', content: Buffer.from('pdf') }];
    await triggerEmail({
      to: 'ada@example.com',
      subject: 'Direct',
      react,
      cc: ['cc@example.com'],
      scheduledAt: '2026-10-23T09:00:00Z',
      attachments,
    });
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cc: ['cc@example.com'],
        scheduledAt: '2026-10-23T09:00:00Z',
        attachments,
      }),
    );
    expect(triggerMock).not.toHaveBeenCalled();
  });

  it('serializes binary attachments exactly once when queueing', async () => {
    process.env.TRIGGER_SECRET_KEY = 'tr_secret';
    const content = Buffer.from([0, 255, 127, 1]);
    await triggerEmail({
      to: 'ada@example.com',
      subject: 'Attachment',
      react,
      attachments: [{ filename: 'binary.bin', content }],
    });
    expect(triggerMock).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({
        attachments: [
          {
            filename: 'binary.bin',
            content: content.toString('base64'),
            contentType: undefined,
          },
        ],
      }),
    );
  });

  it('surfaces failed direct delivery without falling back to a second send', async () => {
    process.env.EMAIL_DELIVERY_MODE = 'direct';
    sendEmailMock.mockRejectedValueOnce(new Error('Delivery failed'));
    await expect(
      triggerEmail({ to: 'ada@example.com', subject: 'Direct', react }),
    ).rejects.toThrow('Delivery failed');
    expect(triggerMock).not.toHaveBeenCalled();
  });
});
