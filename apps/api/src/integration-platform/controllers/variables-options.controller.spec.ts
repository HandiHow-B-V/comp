import { HttpException, NotFoundException } from '@nestjs/common';
import { setupVariablesControllerTests } from './variables.controller.test-fixture';

const harness = setupVariablesControllerTests();

describe('VariablesController', () => {
  it.each(['options', 'save'])(
    'rejects another organization before %s',
    async (operation) => {
      harness.mockConnectionService.getConnectionForOrg.mockRejectedValueOnce(
        new NotFoundException(),
      );
      const request =
        operation === 'options'
          ? harness.controller.fetchVariableOptions(
              'conn_other',
              'var_1',
              'org_1',
            )
          : harness.controller.saveConnectionVariables(
              'conn_other',
              { variables: {} },
              'org_1',
            );
      await expect(request).rejects.toBeInstanceOf(NotFoundException);
      expect(
        harness.mockConnectionService.getConnectionForOrg,
      ).toHaveBeenCalledWith('conn_other', 'org_1');
      expect(harness.mockConnectionRepository.findById).not.toHaveBeenCalled();
      expect(harness.mockConnectionRepository.update).not.toHaveBeenCalled();
    },
  );

  describe('fetchVariableOptions', () => {
    it('should throw NOT_FOUND when connection does not exist', async () => {
      harness.mockConnectionRepository.findById.mockResolvedValue(null);

      await expect(
        harness.controller.fetchVariableOptions(
          'nonexistent',
          'var_1',
          'org_1',
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BAD_REQUEST when connection is not active', async () => {
      harness.mockConnectionRepository.findById.mockResolvedValue({
        id: 'conn_1',
        providerId: 'prov_1',
        status: 'paused',
      });

      await expect(
        harness.controller.fetchVariableOptions('conn_1', 'var_1', 'org_1'),
      ).rejects.toThrow(HttpException);
    });

    it('should return static options when no fetchOptions defined', async () => {
      harness.mockConnectionRepository.findById.mockResolvedValue({
        id: 'conn_1',
        providerId: 'prov_1',
        status: 'active',
      });
      harness.mockProviderRepository.findById.mockResolvedValue({
        id: 'prov_1',
        slug: 'github',
      });
      harness.mockedGetManifest.mockReturnValue({
        variables: [
          {
            id: 'var_1',
            label: 'Var',
            type: 'select',
            options: [{ value: 'a', label: 'A' }],
          },
        ],
        checks: [],
      } as never);

      const result = await harness.controller.fetchVariableOptions(
        'conn_1',
        'var_1',
        'org_1',
      );

      expect(result.options).toEqual([{ value: 'a', label: 'A' }]);
    });

    it('should throw NOT_FOUND when variable does not exist', async () => {
      harness.mockConnectionRepository.findById.mockResolvedValue({
        id: 'conn_1',
        providerId: 'prov_1',
        status: 'active',
      });
      harness.mockProviderRepository.findById.mockResolvedValue({
        id: 'prov_1',
        slug: 'github',
      });
      harness.mockedGetManifest.mockReturnValue({
        variables: [],
        checks: [],
      } as never);

      await expect(
        harness.controller.fetchVariableOptions(
          'conn_1',
          'missing_var',
          'org_1',
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('saveConnectionVariables', () => {
    it('should merge and save variables', async () => {
      harness.mockConnectionRepository.findById.mockResolvedValue({
        id: 'conn_1',
        variables: { existing: 'value' },
      });
      harness.mockConnectionRepository.update.mockResolvedValue(undefined);

      const result = await harness.controller.saveConnectionVariables(
        'conn_1',
        {
          variables: { newVar: 'newValue' },
        },
        'org_1',
      );

      expect(harness.mockConnectionRepository.update).toHaveBeenCalledWith(
        'conn_1',
        {
          variables: { existing: 'value', newVar: 'newValue' },
        },
      );
      expect(result.success).toBe(true);
      expect(result.variables).toEqual({
        existing: 'value',
        newVar: 'newValue',
      });
    });

    it('should throw NOT_FOUND when connection does not exist', async () => {
      harness.mockConnectionRepository.findById.mockResolvedValue(null);

      await expect(
        harness.controller.saveConnectionVariables(
          'nonexistent',
          {
            variables: { key: 'val' },
          },
          'org_1',
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should handle empty existing variables', async () => {
      harness.mockConnectionRepository.findById.mockResolvedValue({
        id: 'conn_1',
        variables: null,
      });
      harness.mockConnectionRepository.update.mockResolvedValue(undefined);

      const result = await harness.controller.saveConnectionVariables(
        'conn_1',
        {
          variables: { newVar: 'value' },
        },
        'org_1',
      );

      expect(harness.mockConnectionRepository.update).toHaveBeenCalledWith(
        'conn_1',
        {
          variables: { newVar: 'value' },
        },
      );
      expect(result.success).toBe(true);
    });

    it('should trigger auto-run checks after saving', async () => {
      harness.mockConnectionRepository.findById.mockResolvedValue({
        id: 'conn_1',
        variables: {},
      });
      harness.mockConnectionRepository.update.mockResolvedValue(undefined);

      await harness.controller.saveConnectionVariables(
        'conn_1',
        {
          variables: { key: 'val' },
        },
        'org_1',
      );

      expect(
        harness.mockAutoCheckRunnerService.tryAutoRunChecks,
      ).toHaveBeenCalledWith('conn_1');
    });
  });
});
