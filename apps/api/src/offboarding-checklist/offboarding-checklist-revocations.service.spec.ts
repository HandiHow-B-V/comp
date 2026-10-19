import { BadRequestException, NotFoundException } from '@nestjs/common';
import { setupOffboardingChecklistTests } from './offboarding-checklist.service.test-fixture';

const harness = setupOffboardingChecklistTests();

describe('OffboardingChecklistService', () => {
  describe('getAccessRevocations', () => {
    it('returns vendor list with revocation status', async () => {
      harness.mockDb.vendor.findMany.mockResolvedValue([
        { id: 'vnd_1', name: 'Slack', website: null, logoUrl: null },
        { id: 'vnd_2', name: 'AWS', website: null, logoUrl: null },
      ]);
      harness.mockDb.offboardingAccessRevocation.findMany.mockResolvedValue([
        {
          id: 'oar_1',
          vendorId: 'vnd_1',
          revokedBy: { id: 'usr_1', name: 'Jane', email: 'jane@test.com' },
          revokedAt: new Date(),
          notes: null,
        },
      ]);
      harness.mockDb.attachment.findMany.mockResolvedValue([]);

      const result = await harness.service.getAccessRevocations(
        'org_1',
        'mem_1',
      );

      expect(result.totalVendors).toBe(2);
      expect(result.revokedCount).toBe(1);
      expect(result.vendors[0].revoked).toBe(true);
      expect(result.vendors[1].revoked).toBe(false);
    });

    it('returns empty when no vendors exist', async () => {
      harness.mockDb.vendor.findMany.mockResolvedValue([]);
      harness.mockDb.offboardingAccessRevocation.findMany.mockResolvedValue([]);
      harness.mockDb.attachment.findMany.mockResolvedValue([]);

      const result = await harness.service.getAccessRevocations(
        'org_1',
        'mem_1',
      );

      expect(result.totalVendors).toBe(0);
      expect(result.revokedCount).toBe(0);
      expect(result.vendors).toHaveLength(0);
    });
  });

  describe('revokeVendorAccess', () => {
    it('creates revocation record', async () => {
      harness.mockDb.member.findFirst.mockResolvedValue({
        id: 'mem_1',
        organizationId: 'org_1',
      });
      harness.mockDb.vendor.findFirst.mockResolvedValue({ id: 'vnd_1' });
      harness.mockDb.offboardingAccessRevocation.findUnique.mockResolvedValue(
        null,
      );
      harness.mockDb.offboardingAccessRevocation.create.mockResolvedValue({
        id: 'oar_1',
        vendorId: 'vnd_1',
        revokedBy: { id: 'usr_1', name: 'Jane', email: 'jane@test.com' },
      });
      // syncAccessRevocationCompletion mocks
      harness.mockDb.offboardingChecklistTemplate.findFirst.mockResolvedValue(
        null,
      );

      const result = await harness.service.revokeVendorAccess({
        organizationId: 'org_1',
        memberId: 'mem_1',
        vendorId: 'vnd_1',
        revokedById: 'usr_1',
      });

      expect(
        harness.mockDb.offboardingAccessRevocation.create,
      ).toHaveBeenCalled();
      expect(result.id).toBe('oar_1');
    });

    it('throws if vendor not found', async () => {
      harness.mockDb.member.findFirst.mockResolvedValue({
        id: 'mem_1',
        organizationId: 'org_1',
      });
      harness.mockDb.vendor.findFirst.mockResolvedValue(null);

      await expect(
        harness.service.revokeVendorAccess({
          organizationId: 'org_1',
          memberId: 'mem_1',
          vendorId: 'vnd_invalid',
          revokedById: 'usr_1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws if already revoked', async () => {
      harness.mockDb.member.findFirst.mockResolvedValue({
        id: 'mem_1',
        organizationId: 'org_1',
      });
      harness.mockDb.vendor.findFirst.mockResolvedValue({ id: 'vnd_1' });
      harness.mockDb.offboardingAccessRevocation.findUnique.mockResolvedValue({
        id: 'oar_1',
      });

      await expect(
        harness.service.revokeVendorAccess({
          organizationId: 'org_1',
          memberId: 'mem_1',
          vendorId: 'vnd_1',
          revokedById: 'usr_1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('undoVendorRevocation', () => {
    it('deletes revocation record', async () => {
      harness.mockDb.offboardingAccessRevocation.findFirst.mockResolvedValue({
        id: 'oar_1',
      });
      harness.mockDb.offboardingAccessRevocation.delete.mockResolvedValue({});
      harness.mockAttachmentsService.getAttachments.mockResolvedValue([]);
      // syncAccessRevocationCompletion mocks
      harness.mockDb.offboardingChecklistTemplate.findFirst.mockResolvedValue(
        null,
      );

      const result = await harness.service.undoVendorRevocation({
        organizationId: 'org_1',
        memberId: 'mem_1',
        vendorId: 'vnd_1',
      });

      expect(
        harness.mockDb.offboardingAccessRevocation.delete,
      ).toHaveBeenCalledWith({ where: { id: 'oar_1' } });
      expect(result.success).toBe(true);
    });

    it('throws if revocation not found', async () => {
      harness.mockDb.offboardingAccessRevocation.findFirst.mockResolvedValue(
        null,
      );

      await expect(
        harness.service.undoVendorRevocation({
          organizationId: 'org_1',
          memberId: 'mem_1',
          vendorId: 'vnd_1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
