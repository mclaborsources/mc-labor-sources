export function collectDistinct(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v?.trim())))].sort((a, b) =>
    a.localeCompare(b),
  );
}
