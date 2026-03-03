import dayjs from "dayjs";

export function monthMatrix(year: number, month: number) {
  const start = dayjs(`${year}-${String(month).padStart(2, "0")}-01`);
  const gridStart = start.startOf("month").startOf("week");
  return Array.from({ length: 42 }).map((_, idx) => gridStart.add(idx, "day"));
}

export function monthLabel(year: number, month: number) {
  return `${year}년 ${month}월`;
}

export function isoDate(input: dayjs.Dayjs | Date | string) {
  return dayjs(input).format("YYYY-MM-DD");
}
