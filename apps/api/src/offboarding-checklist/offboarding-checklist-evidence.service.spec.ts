import { BadRequestException, NotFoundException } from '@nestjs/common';
import { setupOffboardingChecklistTests } from './offboarding-checklist.service.test-fixture';

const harness = setupOffboardingChecklistTests();

describe('OffboardingChecklistService', () => {
  describe('uncompleteItem', () => {
    it('deletes completion and associated evidence', async () => {
      harness.mockDb.offboardingChecklistCompletion.findFirst.mockResolvedValue(
        {
          id: 'occ_1',
        },
      );
      harness.mockAttachmentsService.getAttachments.mockResolvedValue([
        { id: 'att_1' },
        { id: 'att_2' },
      ]);
      harness.mockDb.offboardingChecklistCompletion.delete.mockResolvedValue(
        {},
      );

      await harness.service.uncompleteItem({
        organizationId: 'org_1',
        memberId: 'mem_1',
        templateItemId: 'oct_1',
      });

      expect(
        harness.mockAttachmentsService.deleteAttachment,
      ).toHaveBeenCalledTimes(2);
      expect(
        harness.mockDb.offboardingChecklistCompletion.delete,
      ).toHaveBeenCalledWith({ where: { id: 'occ_1' } });
    });

    it('throws if completion not found', async () => {
      harness.mockDb.offboardingChecklistCompletion.findFirst.mockResolvedValue(
        null,
      );

      await expect(
        harness.service.uncompleteItem({
          organizationId: 'org_1',
          memberId: 'mem_1',
          templateItemId: 'oct_1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteTemplateItem', () => {
    it('soft-disables default items', async () => {
      harness.mockDb.offboardingChecklistTemplate.findFirst.mockResolvedValue({
        id: 'oct_1',
        organizationId: 'org_1',
        isDefault: true,
      });
      harness.mockDb.offboardingChecklistTemplate.update.mockResolvedValue({
        id: 'oct_1',
        isEnabled: false,
      });

      const result = await harness.service.deleteTemplateItem('org_1', 'oct_1');

      expect(
        harness.mockDb.offboardingChecklistTemplate.update,
      ).toHaveBeenCalledWith({
        where: { id: 'oct_1' },
        data: { isEnabled: false },
      });
      expect(
        harness.mockDb.offboardingChecklistTemplate.delete,
      ).not.toHaveBeenCalled();
      expect(result.isEnabled).toBe(false);
    });

    it('hard-deletes custom items', async () => {
      harness.mockDb.offboardingChecklistTemplate.findFirst.mockResolvedValue({
        id: 'oct_2',
        organizationId: 'org_1',
        isDefault: false,
      });
      harness.mockDb.offboardingChecklistTemplate.delete.mockResolvedValue({
        id: 'oct_2',
      });

      await harness.service.deleteTemplateItem('org_1', 'oct_2');

      expect(
        harness.mockDb.offboardingChecklistTemplate.delete,
      ).toHaveBeenCalledWith({ where: { id: 'oct_2' } });
      expect(
        harness.mockDb.offboardingChecklistTemplate.update,
      ).not.toHaveBeenCalled();
    });

    it('throws if item not found', async () => {
      harness.mockDb.offboardingChecklistTemplate.findFirst.mockResolvedValue(
        null,
      );

      await expect(
        harness.service.deleteTemplateItem('org_1', 'oct_invalid'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('uploadEvidenceToCompletion', () => {
    it('uploads evidence to a completed item', async () => {
      harness.mockDb.offboardingChecklistCompletion.findFirst.mockResolvedValue(
        {
          id: 'occ_1',
        },
      );
      harness.mockAttachmentsService.uploadAttachment.mockResolvedValue({
        id: 'att_1',
      });

      const result = await harness.service.uploadEvidenceToCompletion({
        organizationId: 'org_1',
        memberId: 'mem_1',
        templateItemId: 'oct_1',
        uploadDto: {
          fileName: 'screenshot.png',
          fileType: 'image/png',
          fileData: 'base64data',
        },
        userId: 'usr_1',
      });

      expect(
        harness.mockAttachmentsService.uploadAttachment,
      ).toHaveBeenCalledWith(
        'org_1',
        'occ_1',
        'offboarding_checklist',
        {
          fileName: 'screenshot.png',
          fileType: 'image/png',
          fileData: 'base64data',
        },
        'usr_1',
      );
      expect(result.id).toBe('att_1');
    });

    it('throws if item not yet completed', async () => {
      harness.mockDb.offboardingChecklistCompletion.findFirst.mockResolvedValue(
        null,
      );

      await expect(
        harness.service.uploadEvidenceToCompletion({
          organizationId: 'org_1',
          memberId: 'mem_1',
          templateItemId: 'oct_1',
          uploadDto: {
            fileName: 'screenshot.png',
            fileType: 'image/png',
            fileData: 'base64data',
          },
          userId: 'usr_1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
