import { setupGoogleWorkspaceSyncTests } from './sync-gws.controller.test-fixture';

const harness = setupGoogleWorkspaceSyncTests();

describe('SyncController - Google Workspace employees', () => {
  describe('importing new users', () => {
    it('should import a user with no existing member record', async () => {
      harness.setupSync({ gwUsers: [harness.makeGwUser('new@example.com')] });

      harness.mockedDb.user.findUnique.mockResolvedValue(null);
      harness.mockedDb.user.create.mockResolvedValue({
        id: 'user_new',
        email: 'new@example.com',
      });
      harness.mockedDb.member.findFirst.mockResolvedValue(null);
      harness.mockedDb.member.create.mockResolvedValue({
        id: 'mem_new',
      });
      harness.mockedDb.member.findMany.mockResolvedValue([]);

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(result.imported).toBe(1);
      expect(result.reactivated).toBe(0);
      expect(harness.mockedDb.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'new@example.com' }),
      });
      expect(harness.mockedDb.member.create).toHaveBeenCalledWith({
        data: {
          organizationId: harness.orgId,
          userId: 'user_new',
          role: 'employee',
          isActive: true,
        },
      });
    });

    it('should use existing user record when user already exists', async () => {
      harness.setupSync({
        gwUsers: [harness.makeGwUser('existing@example.com')],
      });

      harness.mockedDb.user.findUnique.mockResolvedValue({
        id: 'user_existing',
        email: 'existing@example.com',
      });
      harness.mockedDb.member.findFirst.mockResolvedValue(null);
      harness.mockedDb.member.create.mockResolvedValue({
        id: 'mem_existing',
      });
      harness.mockedDb.member.findMany.mockResolvedValue([]);

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(result.imported).toBe(1);
      expect(harness.mockedDb.user.create).not.toHaveBeenCalled();
    });

    it('should skip active existing members', async () => {
      harness.setupSync({
        gwUsers: [harness.makeGwUser('active@example.com')],
      });

      harness.mockedDb.user.findUnique.mockResolvedValue({
        id: 'user_active',
        email: 'active@example.com',
      });
      harness.mockedDb.member.findFirst.mockResolvedValue(
        harness.makeMember('active@example.com', { userId: 'user_active' }),
      );
      harness.mockedDb.member.findMany.mockResolvedValue([]);

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(result.skipped).toBe(1);
      expect(result.imported).toBe(0);
      expect(result.reactivated).toBe(0);
      expect(harness.mockedDb.member.create).not.toHaveBeenCalled();
      expect(harness.mockedDb.member.update).not.toHaveBeenCalled();
    });
  });

  // ── Deactivated members get reactivated when they reappear in GWS ──
  // Mirrors the JumpCloud + Rippling sync behavior so a user
  // un-suspended in Google Workspace returns to the People tab on the
  // next sync instead of staying invisible forever. Trade-off: a member
  // manually deactivated by an admin will also be reactivated if they
  // are still an active GWS user — admins must remove the user from
  // GWS (or add them to `sync_excluded_emails`) to keep them deactivated.

  describe('reactivation of deactivated members', () => {
    it('should reactivate a deactivated member who is active in GWS', async () => {
      harness.setupSync({ gwUsers: [harness.makeGwUser('back@example.com')] });

      harness.mockedDb.user.findUnique.mockResolvedValue({
        id: 'user_back',
        email: 'back@example.com',
      });
      harness.mockedDb.member.findFirst.mockResolvedValue(
        harness.makeMember('back@example.com', {
          id: 'mem_back',
          userId: 'user_back',
          deactivated: true,
        }),
      );
      harness.mockedDb.member.findMany.mockResolvedValue([]);

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(result.reactivated).toBe(1);
      expect(result.skipped).toBe(0);
      expect(harness.mockedDb.member.update).toHaveBeenCalledWith({
        where: { id: 'mem_back' },
        data: { deactivated: false, isActive: true, offboardDate: null },
      });
    });

    it('should report the reactivation in details with a clear reason', async () => {
      harness.setupSync({ gwUsers: [harness.makeGwUser('back@example.com')] });

      harness.mockedDb.user.findUnique.mockResolvedValue({
        id: 'user_back',
        email: 'back@example.com',
      });
      harness.mockedDb.member.findFirst.mockResolvedValue(
        harness.makeMember('back@example.com', {
          userId: 'user_back',
          deactivated: true,
        }),
      );
      harness.mockedDb.member.findMany.mockResolvedValue([]);

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      const detail = result.details.find((d) => d.email === 'back@example.com');
      expect(detail).toEqual({
        email: 'back@example.com',
        status: 'reactivated',
        reason: 'User is active again in Google Workspace',
      });
    });

    it('should report correct skip reason for active existing members', async () => {
      harness.setupSync({
        gwUsers: [harness.makeGwUser('already@example.com')],
      });

      harness.mockedDb.user.findUnique.mockResolvedValue({
        id: 'user_already',
        email: 'already@example.com',
      });
      harness.mockedDb.member.findFirst.mockResolvedValue(
        harness.makeMember('already@example.com', {
          userId: 'user_already',
          deactivated: false,
        }),
      );
      harness.mockedDb.member.findMany.mockResolvedValue([]);

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      const detail = result.details.find(
        (d) => d.email === 'already@example.com',
      );
      expect(detail).toEqual({
        email: 'already@example.com',
        status: 'skipped',
        reason: 'Already a member',
      });
    });
  });

  // ── Deactivation pass ──────────────────────────────────────────
});
