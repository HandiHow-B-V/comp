import { ForbiddenException } from '@nestjs/common';
import { setupRisksControllerTests } from './risks.controller.test-fixture';

const harness = setupRisksControllerTests();

describe('RisksController', () => {
  describe('getRiskById', () => {
    it('should call findById with correct parameters', async () => {
      harness.risksService.findById.mockResolvedValue(harness.mockRisk);

      await harness.controller.getRiskById(
        'risk_1',
        harness.orgId,
        harness.authContext,
      );

      expect(harness.risksService.findById).toHaveBeenCalledWith(
        'risk_1',
        harness.orgId,
      );
    });

    it('should return risk with auth info', async () => {
      harness.risksService.findById.mockResolvedValue(harness.mockRisk);

      const result = await harness.controller.getRiskById(
        'risk_1',
        harness.orgId,
        harness.authContext,
      );

      expect(result).toEqual({
        ...harness.mockRisk,
        authType: 'session',
        authenticatedUser: {
          id: 'usr_123',
          email: 'admin@example.com',
        },
      });
    });

    it('should check hasRiskAccess and throw ForbiddenException if denied', async () => {
      harness.risksService.findById.mockResolvedValue(harness.mockRisk);
      harness.mockHasRiskAccess.mockReturnValue(false);

      await expect(
        harness.controller.getRiskById(
          'risk_1',
          harness.orgId,
          harness.authContext,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(harness.mockHasRiskAccess).toHaveBeenCalledWith(
        harness.mockRisk,
        harness.authContext.memberId,
        harness.authContext.userRoles,
        { isApiKey: false },
      );
    });

    it('should pass isApiKey option to hasRiskAccess', async () => {
      harness.risksService.findById.mockResolvedValue(harness.mockRisk);

      await harness.controller.getRiskById(
        'risk_1',
        harness.orgId,
        harness.authContextNoUser,
      );

      expect(harness.mockHasRiskAccess).toHaveBeenCalledWith(
        harness.mockRisk,
        harness.authContextNoUser.memberId,
        harness.authContextNoUser.userRoles,
        { isApiKey: true },
      );
    });
  });

  describe('createRisk', () => {
    const createDto = {
      title: 'New Risk',
      description: 'Description',
      category: harness.RiskCategory.operations,
    };

    it('should call create with organizationId and dto', async () => {
      harness.risksService.create.mockResolvedValue(harness.mockRisk);

      await harness.controller.createRisk(
        createDto,
        harness.orgId,
        harness.authContext,
      );

      expect(harness.risksService.create).toHaveBeenCalledWith(
        harness.orgId,
        createDto,
      );
    });

    it('should return created risk with auth info', async () => {
      harness.risksService.create.mockResolvedValue(harness.mockRisk);

      const result = await harness.controller.createRisk(
        createDto,
        harness.orgId,
        harness.authContext,
      );

      expect(result).toEqual({
        ...harness.mockRisk,
        authType: 'session',
        authenticatedUser: {
          id: 'usr_123',
          email: 'admin@example.com',
        },
      });
    });

    it('should omit authenticatedUser for API key auth', async () => {
      harness.risksService.create.mockResolvedValue(harness.mockRisk);

      const result = await harness.controller.createRisk(
        createDto,
        harness.orgId,
        harness.authContextNoUser,
      );

      expect(result).not.toHaveProperty('authenticatedUser');
      expect(result.authType).toBe('api-key');
    });
  });

  describe('updateRisk', () => {
    const updateDto = { title: 'Updated Risk' };
    const updatedRisk = { ...harness.mockRisk, title: 'Updated Risk' };

    it('should call updateById with correct parameters', async () => {
      harness.risksService.updateById.mockResolvedValue(updatedRisk);

      await harness.controller.updateRisk(
        'risk_1',
        updateDto,
        harness.orgId,
        harness.authContext,
      );

      expect(harness.risksService.updateById).toHaveBeenCalledWith(
        'risk_1',
        harness.orgId,
        updateDto,
      );
    });

    it('should return updated risk with auth info', async () => {
      harness.risksService.updateById.mockResolvedValue(updatedRisk);

      const result = await harness.controller.updateRisk(
        'risk_1',
        updateDto,
        harness.orgId,
        harness.authContext,
      );

      expect(result).toEqual({
        ...updatedRisk,
        authType: 'session',
        authenticatedUser: {
          id: 'usr_123',
          email: 'admin@example.com',
        },
      });
    });
  });

  describe('deleteRisk', () => {
    const deleteResult = {
      message: 'Risk deleted successfully',
      deletedRisk: { id: 'risk_1', title: 'Test Risk' },
    };

    it('should call deleteById with correct parameters', async () => {
      harness.risksService.deleteById.mockResolvedValue(deleteResult);

      await harness.controller.deleteRisk(
        'risk_1',
        harness.orgId,
        harness.authContext,
      );

      expect(harness.risksService.deleteById).toHaveBeenCalledWith(
        'risk_1',
        harness.orgId,
      );
    });

    it('should return delete result with auth info', async () => {
      harness.risksService.deleteById.mockResolvedValue(deleteResult);

      const result = await harness.controller.deleteRisk(
        'risk_1',
        harness.orgId,
        harness.authContext,
      );

      expect(result).toEqual({
        ...deleteResult,
        authType: 'session',
        authenticatedUser: {
          id: 'usr_123',
          email: 'admin@example.com',
        },
      });
    });

    it('should omit authenticatedUser for API key auth', async () => {
      harness.risksService.deleteById.mockResolvedValue(deleteResult);

      const result = await harness.controller.deleteRisk(
        'risk_1',
        harness.orgId,
        harness.authContextNoUser,
      );

      expect(result).not.toHaveProperty('authenticatedUser');
    });
  });
});
