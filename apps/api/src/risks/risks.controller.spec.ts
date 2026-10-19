import { setupRisksControllerTests } from './risks.controller.test-fixture';

const harness = setupRisksControllerTests();

describe('RisksController', () => {
  describe('getAllRisks', () => {
    const paginatedResult = {
      data: [harness.mockRisk],
      totalCount: 1,
      page: 1,
      pageCount: 1,
    };

    it('should call findAllByOrganization with correct parameters', async () => {
      harness.risksService.findAllByOrganization.mockResolvedValue(
        paginatedResult,
      );
      const query = { page: 1, perPage: 10 };

      await harness.controller.getAllRisks(
        query,
        harness.orgId,
        harness.authContext,
      );

      expect(harness.mockBuildRiskAssignmentFilter).toHaveBeenCalledWith(
        harness.authContext.memberId,
        harness.authContext.userRoles,
        { isApiKey: false },
      );
      expect(harness.risksService.findAllByOrganization).toHaveBeenCalledWith(
        harness.orgId,
        {},
        query,
      );
    });

    it('should return paginated data with auth info', async () => {
      harness.risksService.findAllByOrganization.mockResolvedValue(
        paginatedResult,
      );

      const result = await harness.controller.getAllRisks(
        {},
        harness.orgId,
        harness.authContext,
      );

      expect(result).toEqual({
        data: paginatedResult.data,
        totalCount: 1,
        page: 1,
        pageCount: 1,
        authType: 'session',
        authenticatedUser: {
          id: 'usr_123',
          email: 'admin@example.com',
        },
      });
    });

    it('should omit authenticatedUser when userId is not present', async () => {
      harness.risksService.findAllByOrganization.mockResolvedValue(
        paginatedResult,
      );

      const result = await harness.controller.getAllRisks(
        {},
        harness.orgId,
        harness.authContextNoUser,
      );

      expect(result.authType).toBe('api-key');
      expect(result).not.toHaveProperty('authenticatedUser');
    });

    it('should pass assignment filter from buildRiskAssignmentFilter', async () => {
      const assignmentFilter = { assigneeId: 'mem_123' };
      harness.mockBuildRiskAssignmentFilter.mockReturnValue(assignmentFilter);
      harness.risksService.findAllByOrganization.mockResolvedValue(
        paginatedResult,
      );

      await harness.controller.getAllRisks(
        {},
        harness.orgId,
        harness.authContext,
      );

      expect(harness.risksService.findAllByOrganization).toHaveBeenCalledWith(
        harness.orgId,
        assignmentFilter,
        {},
      );
    });
  });

  describe('getStatsByAssignee', () => {
    const statsData = [
      {
        id: 'mem_1',
        user: { name: 'User 1', image: null, email: 'u1@test.com' },
        totalRisks: 3,
        openRisks: 1,
        pendingRisks: 1,
        closedRisks: 1,
        archivedRisks: 0,
      },
    ];

    it('should call getStatsByAssignee with organizationId', async () => {
      harness.risksService.getStatsByAssignee.mockResolvedValue(statsData);

      await harness.controller.getStatsByAssignee(
        harness.orgId,
        harness.authContext,
      );

      expect(harness.risksService.getStatsByAssignee).toHaveBeenCalledWith(
        harness.orgId,
      );
    });

    it('should return data with auth info', async () => {
      harness.risksService.getStatsByAssignee.mockResolvedValue(statsData);

      const result = await harness.controller.getStatsByAssignee(
        harness.orgId,
        harness.authContext,
      );

      expect(result).toEqual({
        data: statsData,
        authType: 'session',
        authenticatedUser: {
          id: 'usr_123',
          email: 'admin@example.com',
        },
      });
    });

    it('should omit authenticatedUser for API key auth', async () => {
      harness.risksService.getStatsByAssignee.mockResolvedValue(statsData);

      const result = await harness.controller.getStatsByAssignee(
        harness.orgId,
        harness.authContextNoUser,
      );

      expect(result).not.toHaveProperty('authenticatedUser');
    });
  });

  describe('getStatsByDepartment', () => {
    const deptStats = [
      { department: 'engineering', _count: 5 },
      { department: 'finance', _count: 3 },
    ];

    it('should call getStatsByDepartment with organizationId', async () => {
      harness.risksService.getStatsByDepartment.mockResolvedValue(deptStats);

      await harness.controller.getStatsByDepartment(
        harness.orgId,
        harness.authContext,
      );

      expect(harness.risksService.getStatsByDepartment).toHaveBeenCalledWith(
        harness.orgId,
      );
    });

    it('should return data with auth info', async () => {
      harness.risksService.getStatsByDepartment.mockResolvedValue(deptStats);

      const result = await harness.controller.getStatsByDepartment(
        harness.orgId,
        harness.authContext,
      );

      expect(result).toEqual({
        data: deptStats,
        authType: 'session',
        authenticatedUser: {
          id: 'usr_123',
          email: 'admin@example.com',
        },
      });
    });
  });
});
