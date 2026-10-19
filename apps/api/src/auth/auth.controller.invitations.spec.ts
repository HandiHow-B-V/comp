import 'reflect-metadata';
import type { Invitation } from '@db';
import { NotFoundException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  PATH_METADATA,
  VERSION_METADATA,
} from '@nestjs/common/constants';
import { AuthController } from './auth.controller';
import { HybridAuthGuard } from './hybrid-auth.guard';
import { PermissionGuard, PERMISSIONS_KEY } from './permission.guard';

jest.mock('./hybrid-auth.guard', () => ({
  HybridAuthGuard: class HybridAuthGuard {},
}));
jest.mock('./permission.guard', () => ({
  PermissionGuard: class PermissionGuard {},
  PERMISSIONS_KEY: 'required_permissions',
}));
const findInvitation = jest.fn<Promise<Invitation | null>, [unknown]>();
const deleteInvitation = jest.fn<Promise<Invitation>, [unknown]>();

jest.mock('@db', () => ({
  db: {
    invitation: {
      findFirst: (args: unknown) => findInvitation(args),
      delete: (args: unknown) => deleteInvitation(args),
    },
  },
}));

const pendingInvitation = {
  id: 'inv_123',
  organizationId: 'org_123',
  status: 'pending',
  email: 'invitee@example.com',
  role: 'employee',
  inviterId: 'usr_123',
  expiresAt: new Date('2026-12-01'),
  createdAt: new Date('2026-10-01'),
};

describe('DELETE /v1/auth/invitations/:id', () => {
  const controller = new AuthController();

  beforeEach(() => jest.resetAllMocks());

  it('keeps authentication and member:delete authorization on the migrated route', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      AuthController.prototype,
      'deleteInvitation',
    )?.value;
    if (typeof handler !== 'function')
      throw new Error('Invitation route is missing');
    expect(Reflect.getMetadata(PATH_METADATA, AuthController)).toBe('auth');
    expect(Reflect.getMetadata(VERSION_METADATA, AuthController)).toBe('1');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('invitations/:id');
    expect(Reflect.getMetadata(GUARDS_METADATA, AuthController)).toContain(
      HybridAuthGuard,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
      PermissionGuard,
    );
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      { resource: 'member', actions: ['delete'] },
    ]);
  });

  it('returns not found for a missing, accepted or other-organization invitation', async () => {
    findInvitation.mockResolvedValue(null);

    await expect(
      controller.deleteInvitation('inv_123', 'org_123'),
    ).rejects.toThrow(
      new NotFoundException('Invitation not found or already accepted.'),
    );
    expect(findInvitation).toHaveBeenCalledWith({
      where: { id: 'inv_123', organizationId: 'org_123', status: 'pending' },
    });
    expect(deleteInvitation).not.toHaveBeenCalled();
  });

  it('deletes a pending invitation only after the organization-scoped lookup', async () => {
    findInvitation.mockResolvedValue(pendingInvitation);
    deleteInvitation.mockResolvedValue(pendingInvitation);

    await expect(
      controller.deleteInvitation('inv_123', 'org_123'),
    ).resolves.toEqual({ success: true });
    expect(findInvitation).toHaveBeenCalledWith({
      where: { id: 'inv_123', organizationId: 'org_123', status: 'pending' },
    });
    expect(deleteInvitation).toHaveBeenCalledWith({ where: { id: 'inv_123' } });
    expect(findInvitation.mock.invocationCallOrder[0]).toBeLessThan(
      deleteInvitation.mock.invocationCallOrder[0],
    );
  });
});
