export function parseFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function parseLatitude(value: unknown): number | null {
  const latitude = parseFiniteNumber(value);
  if (latitude === null || latitude < -90 || latitude > 90) return null;
  return latitude;
}

export function parseLongitude(value: unknown): number | null {
  const longitude = parseFiniteNumber(value);
  if (longitude === null || longitude < -180 || longitude > 180) return null;
  return longitude;
}

export function parseMoney(value: unknown): number | null {
  const amount = parseFiniteNumber(value);
  if (amount === null || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

export function parsePositiveInt(value: unknown): number | null {
  const numberValue = parseFiniteNumber(value);
  if (numberValue === null || numberValue < 0 || !Number.isInteger(numberValue)) return null;
  return numberValue;
}
