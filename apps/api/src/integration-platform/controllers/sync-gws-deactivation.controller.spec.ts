import { setupGoogleWorkspaceSyncTests } from './sync-gws.controller.test-fixture';

const harness = setupGoogleWorkspaceSyncTests();

describe('SyncController - Google Workspace employees', () => {
  describe('deactivation of suspended/deleted users', () => {
    it('should deactivate members who are suspended in Google Workspace', async () => {
      harness.setupSync({
        gwUsers: [harness.makeGwUser('sus@example.com', { suspended: true })],
      });

      harness.mockedDb.member.findMany.mockResolvedValue([
        harness.makeMember('sus@example.com'),
      ]);
      harness.mockedDb.member.update.mockResolvedValue({});

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(result.deactivated).toBe(1);
      expect(harness.mockedDb.member.update).toHaveBeenCalledWith({
        where: { id: 'mem_sus' },
        data: { deactivated: true, isActive: false },
      });
      const detail = result.details.find((d) => d.email === 'sus@example.com');
      expect(detail?.reason).toBe('User is suspended in Google Workspace');
    });

    it('should deactivate members deleted from Google Workspace', async () => {
      // GWS returns one active user but the org also has a member
      // whose email is no longer in GWS — they were deleted
      harness.setupSync({
        gwUsers: [harness.makeGwUser('still-active@example.com')],
      });

      harness.mockedDb.user.findUnique.mockResolvedValue({
        id: 'user_still',
        email: 'still-active@example.com',
      });
      harness.mockedDb.member.findFirst.mockResolvedValue(
        harness.makeMember('still-active@example.com', {
          userId: 'user_still',
        }),
      );

      harness.mockedDb.member.findMany.mockResolvedValue([
        harness.makeMember('still-active@example.com'),
        harness.makeMember('deleted@example.com'),
      ]);
      harness.mockedDb.member.update.mockResolvedValue({});

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(result.deactivated).toBe(1);
      const detail = result.details.find(
        (d) => d.email === 'deleted@example.com',
      );
      expect(detail?.reason).toBe('User was removed from Google Workspace');
    });

    it('should NOT deactivate privileged members (owner)', async () => {
      // Need a GWS user on the same domain so the domain check passes
      // and the role guard is actually exercised
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

      // Owner is not in GWS active list — would be deactivated if not privileged
      // Include an unprivileged member to prove deactivation works for non-privileged
      harness.mockedDb.member.findMany.mockResolvedValue([
        harness.makeMember('active@example.com'),
        harness.makeMember('owner@example.com', { role: 'owner' }),
        harness.makeMember('gone@example.com', { role: 'employee' }),
      ]);
      harness.mockedDb.member.update.mockResolvedValue({});

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      // gone@ gets deactivated, owner@ does not
      expect(result.deactivated).toBe(1);
      const deactivatedEmails = result.details
        .filter((d) => d.status === 'deactivated')
        .map((d) => d.email);
      expect(deactivatedEmails).toContain('gone@example.com');
      expect(deactivatedEmails).not.toContain('owner@example.com');
    });

    it('should NOT deactivate privileged members (admin)', async () => {
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

      harness.mockedDb.member.findMany.mockResolvedValue([
        harness.makeMember('active@example.com'),
        harness.makeMember('admin@example.com', { role: 'admin' }),
        harness.makeMember('gone@example.com', { role: 'employee' }),
      ]);
      harness.mockedDb.member.update.mockResolvedValue({});

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(result.deactivated).toBe(1);
      const deactivatedEmails = result.details
        .filter((d) => d.status === 'deactivated')
        .map((d) => d.email);
      expect(deactivatedEmails).toContain('gone@example.com');
      expect(deactivatedEmails).not.toContain('admin@example.com');
    });

    it('should NOT deactivate privileged members (auditor)', async () => {
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

      harness.mockedDb.member.findMany.mockResolvedValue([
        harness.makeMember('active@example.com'),
        harness.makeMember('auditor@example.com', { role: 'auditor' }),
        harness.makeMember('gone@example.com', { role: 'employee' }),
      ]);
      harness.mockedDb.member.update.mockResolvedValue({});

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(result.deactivated).toBe(1);
      const deactivatedEmails = result.details
        .filter((d) => d.status === 'deactivated')
        .map((d) => d.email);
      expect(deactivatedEmails).toContain('gone@example.com');
      expect(deactivatedEmails).not.toContain('auditor@example.com');
    });

    it('should NOT deactivate members with comma-separated roles including a privileged role', async () => {
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

      harness.mockedDb.member.findMany.mockResolvedValue([
        harness.makeMember('active@example.com'),
        harness.makeMember('multi@example.com', { role: 'employee,admin' }),
        harness.makeMember('gone@example.com', { role: 'employee' }),
      ]);
      harness.mockedDb.member.update.mockResolvedValue({});

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(result.deactivated).toBe(1);
      const deactivatedEmails = result.details
        .filter((d) => d.status === 'deactivated')
        .map((d) => d.email);
      expect(deactivatedEmails).toContain('gone@example.com');
      expect(deactivatedEmails).not.toContain('multi@example.com');
    });

    it('should NOT deactivate members whose domain does not match GWS domain', async () => {
      // GWS users are @example.com, but the member is @otherdomain.com
      harness.setupSync({ gwUsers: [harness.makeGwUser('user@example.com')] });

      harness.mockedDb.user.findUnique.mockResolvedValue({
        id: 'user_u',
        email: 'user@example.com',
      });
      harness.mockedDb.member.findFirst.mockResolvedValue(
        harness.makeMember('user@example.com', { userId: 'user_u' }),
      );
      harness.mockedDb.member.findMany.mockResolvedValue([
        harness.makeMember('external@otherdomain.com'),
      ]);

      const result = await harness.controller.syncGoogleWorkspaceEmployees(
        harness.orgId,
        harness.connectionId,
      );

      expect(result.deactivated).toBe(0);
    });
  });

  // ── Exclude filter mode ────────────────────────────────────────
});
