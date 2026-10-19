import { BadRequestException, NotFoundException } from '@nestjs/common';
import { setupOffboardingChecklistTests } from './offboarding-checklist.service.test-fixture';

const harness = setupOffboardingChecklistTests();

describe('OffboardingChecklistService', () => {
  describe('getTemplate', () => {
    it('seeds defaults when none exist', async () => {
      harness.mockDb.offboardingChecklistTemplate.count.mockResolvedValue(0);
      harness.mockDb.offboardingChecklistTemplate.createMany.mockResolvedValue({
        count: harness.DEFAULT_OFFBOARDING_CHECKLIST_ITEMS.length,
      });
      harness.mockDb.offboardingChecklistTemplate.findMany.mockResolvedValue(
        harness.DEFAULT_OFFBOARDING_CHECKLIST_ITEMS.map((item, i) => ({
          id: `oct_${i}`,
          organizationId: 'org_1',
          ...item,
          isDefault: true,
          isEnabled: true,
        })),
      );

      const result = await harness.service.getTemplate('org_1');

      expect(
        harness.mockDb.offboardingChecklistTemplate.createMany,
      ).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            organizationId: 'org_1',
            title: 'Revoke system access',
            isDefault: true,
            isEnabled: true,
          }),
        ]),
      });
      expect(result).toHaveLength(
        harness.DEFAULT_OFFBOARDING_CHECKLIST_ITEMS.length,
      );
    });

    it('returns existing items without seeding', async () => {
      const existingItems = [
        {
          id: 'oct_1',
          organizationId: 'org_1',
          title: 'Custom item',
          isDefault: false,
          isEnabled: true,
          sortOrder: 1,
        },
      ];
      harness.mockDb.offboardingChecklistTemplate.count.mockResolvedValue(1);
      harness.mockDb.offboardingChecklistTemplate.findMany.mockResolvedValue(
        existingItems,
      );

      const result = await harness.service.getTemplate('org_1');

      expect(
        harness.mockDb.offboardingChecklistTemplate.createMany,
      ).not.toHaveBeenCalled();
      expect(result).toEqual(existingItems);
    });
  });

  describe('getMemberChecklist', () => {
    it('returns items with completion status', async () => {
      harness.mockDb.offboardingChecklistTemplate.count.mockResolvedValue(2);
      harness.mockDb.offboardingChecklistTemplate.findMany.mockResolvedValue([
        {
          id: 'oct_1',
          organizationId: 'org_1',
          title: 'Item 1',
          isEnabled: true,
          sortOrder: 1,
        },
        {
          id: 'oct_2',
          organizationId: 'org_1',
          title: 'Item 2',
          isEnabled: true,
          sortOrder: 2,
        },
      ]);
      harness.mockDb.offboardingChecklistCompletion.findMany.mockResolvedValue([
        {
          id: 'occ_1',
          templateItemId: 'oct_1',
          memberId: 'mem_1',
          completedById: 'usr_1',
          completedBy: { id: 'usr_1', name: 'Test User' },
        },
      ]);
      harness.mockDb.attachment.findMany.mockResolvedValue([
        {
          id: 'att_1',
          name: 'evidence.pdf',
          url: 's3://bucket/key',
          entityId: 'occ_1',
        },
      ]);

      const result = await harness.service.getMemberChecklist('org_1', 'mem_1');

      expect(result.totalItems).toBe(2);
      expect(result.completedItems).toBe(1);
      expect(result.items[0].completed).toBe(true);
      expect(result.items[0].evidence).toHaveLength(1);
      expect(result.items[1].completed).toBe(false);
      expect(result.items[1].evidence).toHaveLength(0);
    });
  });

  describe('completeItem', () => {
    it('creates completion record', async () => {
      harness.mockDb.offboardingChecklistCompletion.findFirst.mockResolvedValue(
        null,
      );
      harness.mockDb.offboardingChecklistTemplate.findFirst.mockResolvedValue({
        id: 'oct_1',
        organizationId: 'org_1',
        isEnabled: true,
      });
      harness.mockDb.offboardingChecklistCompletion.create.mockResolvedValue({
        id: 'occ_1',
        organizationId: 'org_1',
        memberId: 'mem_1',
        templateItemId: 'oct_1',
        completedById: 'usr_1',
        notes: 'Done',
      });

      const result = await harness.service.completeItem({
        organizationId: 'org_1',
        memberId: 'mem_1',
        templateItemId: 'oct_1',
        completedById: 'usr_1',
        dto: { notes: 'Done' },
      });

      expect(result.id).toBe('occ_1');
      expect(
        harness.mockDb.offboardingChecklistCompletion.create,
      ).toHaveBeenCalledWith({
        data: {
          organizationId: 'org_1',
          memberId: 'mem_1',
          templateItemId: 'oct_1',
          completedById: 'usr_1',
          notes: 'Done',
        },
      });
    });

    it('throws if already completed', async () => {
      harness.mockDb.offboardingChecklistCompletion.findFirst.mockResolvedValue(
        {
          id: 'occ_1',
        },
      );

      await expect(
        harness.service.completeItem({
          organizationId: 'org_1',
          memberId: 'mem_1',
          templateItemId: 'oct_1',
          completedById: 'usr_1',
          dto: {},
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws if template item not found', async () => {
      harness.mockDb.offboardingChecklistCompletion.findFirst.mockResolvedValue(
        null,
      );
      harness.mockDb.offboardingChecklistTemplate.findFirst.mockResolvedValue(
        null,
      );

      await expect(
        harness.service.completeItem({
          organizationId: 'org_1',
          memberId: 'mem_1',
          templateItemId: 'oct_invalid',
          completedById: 'usr_1',
          dto: {},
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('uploads evidence when file data is provided', async () => {
      harness.mockDb.offboardingChecklistCompletion.findFirst.mockResolvedValue(
        null,
      );
      harness.mockDb.offboardingChecklistTemplate.findFirst.mockResolvedValue({
        id: 'oct_1',
        organizationId: 'org_1',
        isEnabled: true,
      });
      harness.mockDb.offboardingChecklistCompletion.create.mockResolvedValue({
        id: 'occ_1',
        organizationId: 'org_1',
        memberId: 'mem_1',
        templateItemId: 'oct_1',
        completedById: 'usr_1',
      });
      harness.mockAttachmentsService.uploadAttachment.mockResolvedValue({
        id: 'att_1',
      });

      await harness.service.completeItem({
        organizationId: 'org_1',
        memberId: 'mem_1',
        templateItemId: 'oct_1',
        completedById: 'usr_1',
        dto: {
          fileName: 'evidence.pdf',
          fileType: 'application/pdf',
          fileData: 'base64data',
        },
      });

      expect(
        harness.mockAttachmentsService.uploadAttachment,
      ).toHaveBeenCalledWith(
        'org_1',
        'occ_1',
        'offboarding_checklist',
        {
          fileName: 'evidence.pdf',
          fileData: 'base64data',
          fileType: 'application/pdf',
        },
        'usr_1',
      );
    });
  });
});
