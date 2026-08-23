export function normalizeBarcode(value: unknown): string {
  return String(value ?? "").trim();
}

export function isSupportedBarcode(value: string): boolean {
  const normalized = normalizeBarcode(value);
  return normalized.length >= 4 && normalized.length <= 32;
}
