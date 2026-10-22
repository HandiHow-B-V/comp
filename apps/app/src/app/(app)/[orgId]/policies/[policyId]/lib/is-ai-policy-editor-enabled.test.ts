import { describe, expect, it } from 'vitest';
import { isAiPolicyEditorEnabled } from './is-ai-policy-editor-enabled';

describe('self-hosted policy AI availability', () => {
  it.each(['true', '1'])(
    'enables self-hosted editing with %s without a hosted feature flag',
    (selfHosted) => {
      expect(isAiPolicyEditorEnabled({ selfHosted, featureFlag: false })).toBe(true);
    },
  );

  it.each([true, 'true'])('keeps the hosted feature flag working with %s', (featureFlag) => {
    expect(isAiPolicyEditorEnabled({ selfHosted: 'false', featureFlag })).toBe(true);
  });

  it.each([false, 'false', undefined, 1])(
    'does not enable a hosted deployment for %s',
    (featureFlag) => {
      expect(isAiPolicyEditorEnabled({ featureFlag })).toBe(false);
    },
  );
});
