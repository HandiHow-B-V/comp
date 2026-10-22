import { GUARDS_METADATA } from '@nestjs/common/constants';

const triggerMock = jest.fn();
jest.mock('@trigger.dev/sdk', () => ({
  tasks: { trigger: (...args: unknown[]) => triggerMock(...args) },
}));
jest.mock('../auth/hybrid-auth.guard', () => ({
  HybridAuthGuard: class HybridAuthGuard {},
}));
jest.mock('../auth/permission.guard', () => ({
  PermissionGuard: class PermissionGuard {},
  PERMISSIONS_KEY: 'required_permissions',
}));

import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard, PERMISSIONS_KEY } from '../auth/permission.guard';
import { EmailController } from './email.controller';

const originalEnv = process.env;

describe('self-hosted internal email configuration', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of [
      'BREVO_FROM_SYSTEM',
      'BREVO_FROM_DEFAULT',
      'RESEND_FROM_SYSTEM',
      'RESEND_FROM_DEFAULT',
    ])
      delete process.env[key];
    triggerMock.mockReset().mockResolvedValue({ id: 'run-test' });
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  it('keeps authentication and send permission gates on both internal endpoints', () => {
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      EmailController,
    );
    expect(guards).toEqual([HybridAuthGuard, PermissionGuard]);
    for (const method of [
      EmailController.prototype.sendEmail,
      EmailController.prototype.sendBatchEmail,
    ]) {
      const permissions: unknown = Reflect.getMetadata(PERMISSIONS_KEY, method);
      expect(permissions).toEqual([{ resource: 'email', actions: ['send'] }]);
    }
  });

  it.each([
    'BREVO_FROM_SYSTEM',
    'RESEND_FROM_SYSTEM',
    'BREVO_FROM_DEFAULT',
    'RESEND_FROM_DEFAULT',
  ])('uses %s when earlier sender choices are absent', async (key) => {
    process.env[key] = 'configured@example.com';
    const response = await new EmailController().sendBatchEmail({
      emails: [
        { to: 'ada@example.com', subject: 'Hello', html: '<p>Hello</p>' },
      ],
    });
    expect(response).toEqual({ success: true, taskId: 'run-test' });
    expect(triggerMock).toHaveBeenCalledWith('send-batch-email', {
      emails: [expect.objectContaining({ from: 'configured@example.com' })],
    });
  });

  it('prefers the Brevo system sender while preserving explicit per-message overrides', async () => {
    process.env.BREVO_FROM_SYSTEM = 'brevo@example.com';
    process.env.RESEND_FROM_SYSTEM = 'resend@example.com';
    const email = {
      to: 'ada@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
    };
    await new EmailController().sendBatchEmail({
      emails: [email, { ...email, from: 'explicit@example.com' }],
    });
    expect(triggerMock).toHaveBeenCalledWith('send-batch-email', {
      emails: [
        expect.objectContaining({ from: 'brevo@example.com' }),
        expect.objectContaining({ from: 'explicit@example.com' }),
      ],
    });
  });
});
