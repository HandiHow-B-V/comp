import { HttpException, NotFoundException } from '@nestjs/common';
import { setupVariablesControllerTests } from './variables.controller.test-fixture';

const harness = setupVariablesControllerTests();

describe('VariablesController', () => {
  it('rejects another organization before reading connection variables', async () => {
    harness.mockConnectionService.getConnectionForOrg.mockRejectedValueOnce(
      new NotFoundException(),
    );
    await expect(
      harness.controller.getConnectionVariables('conn_other', 'org_1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      harness.mockConnectionService.getConnectionForOrg,
    ).toHaveBeenCalledWith('conn_other', 'org_1');
    expect(harness.mockConnectionRepository.findById).not.toHaveBeenCalled();
  });

  describe('getProviderVariables', () => {
    it('should return variables from manifest', async () => {
      const manifest = {
        variables: [
          {
            id: 'org_name',
            label: 'Organization',
            type: 'string',
            required: true,
          },
        ],
        checks: [
          {
            variables: [
              {
                id: 'repo_name',
                label: 'Repository',
                type: 'string',
                required: false,
              },
            ],
          },
        ],
      };
      harness.mockedGetManifest.mockReturnValue(manifest as never);

      const result = await harness.controller.getProviderVariables('github');

      expect(harness.mockedGetManifest).toHaveBeenCalledWith('github');
      expect(result.variables).toHaveLength(2);
      expect(result.variables[0].id).toBe('org_name');
      expect(result.variables[1].id).toBe('repo_name');
    });

    it('should throw NOT_FOUND when provider does not exist', async () => {
      harness.mockedGetManifest.mockReturnValue(undefined);

      await expect(
        harness.controller.getProviderVariables('nonexistent'),
      ).rejects.toThrow(HttpException);
    });

    it('should deduplicate variables by id', async () => {
      const manifest = {
        variables: [
          {
            id: 'shared_var',
            label: 'Shared',
            type: 'string',
            required: true,
          },
        ],
        checks: [
          {
            variables: [
              {
                id: 'shared_var',
                label: 'Shared Duplicate',
                type: 'string',
                required: false,
              },
            ],
          },
        ],
      };
      harness.mockedGetManifest.mockReturnValue(manifest as never);

      const result = await harness.controller.getProviderVariables('test');

      expect(result.variables).toHaveLength(1);
      expect(result.variables[0].label).toBe('Shared');
    });

    it('should set hasDynamicOptions based on fetchOptions', async () => {
      const manifest = {
        variables: [
          {
            id: 'static_var',
            label: 'Static',
            type: 'select',
            required: false,
            options: [{ value: 'a', label: 'A' }],
          },
          {
            id: 'dynamic_var',
            label: 'Dynamic',
            type: 'select',
            required: false,
            fetchOptions: jest.fn(),
          },
        ],
        checks: [],
      };
      harness.mockedGetManifest.mockReturnValue(manifest as never);

      const result = await harness.controller.getProviderVariables('test');

      expect(result.variables[0].hasDynamicOptions).toBe(false);
      expect(result.variables[1].hasDynamicOptions).toBe(true);
    });
  });

  describe('getConnectionVariables', () => {
    it('should return variables with current values', async () => {
      harness.mockConnectionRepository.findById.mockResolvedValue({
        id: 'conn_1',
        providerId: 'prov_1',
        variables: { org_name: 'my-org' },
      });
      harness.mockProviderRepository.findById.mockResolvedValue({
        id: 'prov_1',
        slug: 'github',
      });
      harness.mockedGetManifest.mockReturnValue({
        variables: [
          {
            id: 'org_name',
            label: 'Organization',
            type: 'string',
            required: true,
          },
        ],
        checks: [],
      } as never);

      const result = await harness.controller.getConnectionVariables(
        'conn_1',
        'org_1',
      );

      expect(result.connectionId).toBe('conn_1');
      expect(result.providerSlug).toBe('github');
      expect(result.variables).toHaveLength(1);
      expect(result.variables[0].currentValue).toBe('my-org');
    });

    it('should throw NOT_FOUND when connection does not exist', async () => {
      harness.mockConnectionRepository.findById.mockResolvedValue(null);

      await expect(
        harness.controller.getConnectionVariables('nonexistent', 'org_1'),
      ).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND when provider does not exist', async () => {
      harness.mockConnectionRepository.findById.mockResolvedValue({
        id: 'conn_1',
        providerId: 'prov_1',
        variables: {},
      });
      harness.mockProviderRepository.findById.mockResolvedValue(null);

      await expect(
        harness.controller.getConnectionVariables('conn_1', 'org_1'),
      ).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND when manifest does not exist', async () => {
      harness.mockConnectionRepository.findById.mockResolvedValue({
        id: 'conn_1',
        providerId: 'prov_1',
        variables: {},
      });
      harness.mockProviderRepository.findById.mockResolvedValue({
        id: 'prov_1',
        slug: 'missing',
      });
      harness.mockedGetManifest.mockReturnValue(undefined);

      await expect(
        harness.controller.getConnectionVariables('conn_1', 'org_1'),
      ).rejects.toThrow(HttpException);
    });
  });
});
