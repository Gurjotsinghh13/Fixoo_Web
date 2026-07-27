const INDIA_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function shiftedIndiaDate(date: Date) {
  return new Date(date.getTime() + INDIA_OFFSET_MS);
}

function indiaMidnightUtc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day) - INDIA_OFFSET_MS);
}

export function startOfIndiaDay(date: Date) {
  const shifted = shiftedIndiaDate(date);
  return indiaMidnightUtc(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  );
}

export function startOfIndiaWeek(date: Date) {
  const shifted = shiftedIndiaDate(date);
  const mondayOffset = (shifted.getUTCDay() + 6) % 7;
  return indiaMidnightUtc(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - mondayOffset
  );
}

export function startOfIndiaMonth(date: Date) {
  const shifted = shiftedIndiaDate(date);
  return indiaMidnightUtc(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1);
}

export function addIndiaDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function indiaDateKey(date: Date) {
  return shiftedIndiaDate(date).toISOString().slice(0, 10);
}

export function indiaMonthKey(date: Date) {
  return shiftedIndiaDate(date).toISOString().slice(0, 7);
}
