export function isAiPolicyEditorEnabled({
  selfHosted,
  featureFlag,
}: {
  selfHosted?: string;
  featureFlag?: unknown;
}): boolean {
  return (
    selfHosted === 'true' || selfHosted === '1' || featureFlag === true || featureFlag === 'true'
  );
}
