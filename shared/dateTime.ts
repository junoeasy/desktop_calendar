function pad(value: number) {
  return String(value).padStart(2, "0");
}

function parseDateIso(dateIso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) {
    throw new Error(`Invalid date ISO: ${dateIso}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function toDateIsoParts(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localDateTimeToUtcIso(dateIso: string, time: string) {
  const { year, month, day } = parseDateIso(dateIso);
  const [hourRaw, minuteRaw] = time.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

export function localDayBoundsToUtc(dateIso: string) {
  const { year, month, day } = parseDateIso(dateIso);
  return {
    start: new Date(year, month - 1, day, 0, 0, 0, 0).toISOString(),
    end: new Date(year, month - 1, day, 23, 59, 59, 999).toISOString()
  };
}

export function localMonthBoundsToUtc(year: number, month: number) {
  return {
    start: new Date(year, month - 1, 1, 0, 0, 0, 0).toISOString(),
    end: new Date(year, month, 0, 23, 59, 59, 999).toISOString()
  };
}

export function localDateFromIso(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return toDateIsoParts(date);
}

export function addDaysToDateIso(dateIso: string, days: number) {
  const { year, month, day } = parseDateIso(dateIso);
  return toDateIsoParts(new Date(year, month - 1, day + days, 0, 0, 0, 0));
}

export function isSameLocalDate(input: string | Date, dateIso: string) {
  return localDateFromIso(input) === dateIso;
}
