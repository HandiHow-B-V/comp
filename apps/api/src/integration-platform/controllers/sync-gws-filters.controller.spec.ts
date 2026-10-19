import { setupGoogleWorkspaceSyncTests } from './sync-gws.controller.test-fixture';

const harness = setupGoogleWorkspaceSyncTests();

describe('SyncController - Google Workspace employees', () => {
  it('does not sync a connection from another organization', async () => {
    harness.setupSync({ gwUsers: [] });
    await expect(
      harness.controller.syncGoogleWorkspaceEmployees(
        'other_org',
        harness.connectionId,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      harness.mockedDb.integrationProvider.findUnique,
    ).not.toHaveBeenCalled();
    expect(harness.mockedDb.member.create).not.toHaveBeenCalled();
  });

  describe('exclude filter mode', () => {
    it('should deactivate existing non-privileged members excluded from sync', async () => {
      harness.setupSync({
        gwUsers: [
          harness.makeGwUser('kept@example.com'),
          harness.makeGwUser('excluded@example.com'),
        ],
        variables: {
          sync_user_filter_mode: 'exclude',
          sync_excluded_emails: 'excluded@example.com',
        },
      });

      harness.mockedDb.user.findUnique.mockResolvedValue({
        id: 'user_kept',
        email: 'kept@example.com',
      });
      harness.mockedDb.member.findFirst.mockResolvedValue(
        harness.makeMember('kept@example.com', { userId: 'user_kept' }),
      );

      harness.mockedDb.member.findMany.mockResolvedValue([
        harness.makeMember('kept@example.com'),
        harness.makeMember('excluded@example.com'),
      ]);

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      // excluded@example.com should NOT be deactivated even though
      // it's not in the active users list — it was excluded from sync
      const deactivatedEmails = result.details
        .filter((d) => d.status === 'deactivated')
        .map((d) => d.email);
      expect(deactivatedEmails).toContain('excluded@example.com');
      expect(result.details).toContainEqual(
        expect.objectContaining({
          email: 'excluded@example.com',
          status: 'deactivated',
          reason: 'User is excluded from Google Workspace sync',
        }),
      );
    });

    it('should exclude users from import by email match', async () => {
      harness.setupSync({
        gwUsers: [
          harness.makeGwUser('include@example.com'),
          harness.makeGwUser('exclude@example.com'),
        ],
        variables: {
          sync_user_filter_mode: 'exclude',
          sync_excluded_emails: 'exclude@example.com',
        },
      });

      // include@example.com gets imported
      harness.mockedDb.user.findUnique.mockResolvedValue({
        id: 'user_include',
        email: 'include@example.com',
      });
      harness.mockedDb.member.findFirst.mockResolvedValue(null);
      harness.mockedDb.member.create.mockResolvedValue({
        id: 'mem_include',
      });
      harness.mockedDb.member.findMany.mockResolvedValue([]);

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      // Only include@example.com should be imported; exclude@ is filtered out
      expect(result.imported).toBe(1);
      expect(result.totalFound).toBe(1);
    });
  });

  // ── Mixed scenario ─────────────────────────────────────────────

  describe('mixed scenarios', () => {
    it('should handle a mix of new, existing, deactivated, and suspended users', async () => {
      harness.setupSync({
        gwUsers: [
          harness.makeGwUser('new@example.com'),
          harness.makeGwUser('active@example.com'),
          harness.makeGwUser('deactivated@example.com'),
          harness.makeGwUser('suspended@example.com', { suspended: true }),
        ],
      });

      harness.mockedDb.user.findUnique.mockImplementation(
        ({ where }: { where: { email: string } }) => {
          const map: Record<string, unknown> = {
            'new@example.com': null,
            'active@example.com': {
              id: 'user_active',
              email: 'active@example.com',
            },
            'deactivated@example.com': {
              id: 'user_deact',
              email: 'deactivated@example.com',
            },
          };
          return Promise.resolve(map[where.email] ?? null);
        },
      );
      harness.mockedDb.user.create.mockResolvedValue({
        id: 'user_new',
        email: 'new@example.com',
      });

      harness.mockedDb.member.findFirst.mockImplementation(
        ({ where }: { where: { organizationId: string; userId: string } }) => {
          const map: Record<string, unknown> = {
            user_active: harness.makeMember('active@example.com', {
              userId: 'user_active',
              deactivated: false,
            }),
            user_deact: harness.makeMember('deactivated@example.com', {
              userId: 'user_deact',
              deactivated: true,
            }),
          };
          return Promise.resolve(map[where.userId] ?? null);
        },
      );
      harness.mockedDb.member.create.mockResolvedValue({
        id: 'mem_new',
      });

      // Deactivation pass: suspended@example.com member is active in org
      harness.mockedDb.member.findMany.mockResolvedValue([
        harness.makeMember('suspended@example.com'),
        harness.makeMember('active@example.com'),
      ]);
      harness.mockedDb.member.update.mockResolvedValue({});

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(result.imported).toBe(1); // new@example.com
      expect(result.skipped).toBe(1); // active@example.com
      expect(result.reactivated).toBe(1); // deactivated@example.com comes back
      expect(result.deactivated).toBe(1); // suspended@example.com
    });
  });

  // ── Response shape ─────────────────────────────────────────────

  describe('response format', () => {
    it('should return success:true and all counter fields', async () => {
      harness.setupSync({ gwUsers: [] });
      harness.mockedDb.member.findMany.mockResolvedValue([]);

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          totalFound: 0,
          totalSuspended: 0,
          imported: 0,
          skipped: 0,
          deactivated: 0,
          reactivated: 0,
          errors: 0,
          details: [],
        }),
      );
    });
  });

  // ── lastSyncAt bookkeeping ─────────────────────────────────────

  describe('lastSyncAt update', () => {
    it('should record lastSyncAt on the connection after a successful sync', async () => {
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

      await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(harness.mockConnectionRepo.update).toHaveBeenCalledWith(
        harness.connectionId,
        expect.objectContaining({ lastSyncAt: expect.any(Date) }),
      );
    });

    it('should record lastSyncAt even when the sync finds zero users', async () => {
      harness.setupSync({ gwUsers: [] });
      harness.mockedDb.member.findMany.mockResolvedValue([]);

      await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(harness.mockConnectionRepo.update).toHaveBeenCalledWith(
        harness.connectionId,
        expect.objectContaining({ lastSyncAt: expect.any(Date) }),
      );
    });
  });

  // ── Error handling ─────────────────────────────────────────────

  describe('error handling', () => {
    it('should count errors when user creation fails', async () => {
      harness.setupSync({ gwUsers: [harness.makeGwUser('fail@example.com')] });

      harness.mockedDb.user.findUnique.mockResolvedValue(null);
      harness.mockedDb.user.create.mockRejectedValue(
        new Error('DB write failed'),
      );
      harness.mockedDb.member.findMany.mockResolvedValue([]);

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(result.errors).toBe(1);
      expect(result.imported).toBe(0);
      const detail = result.details.find((d) => d.email === 'fail@example.com');
      expect(detail?.status).toBe('error');
      expect(detail?.reason).toBe('DB write failed');
    });
  });
});
