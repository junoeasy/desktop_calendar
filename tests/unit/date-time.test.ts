import { describe, expect, it } from "vitest";
import { addDaysToDateIso, localDateFromIso, localDateTimeToUtcIso, localDayBoundsToUtc, localMonthBoundsToUtc } from "../../shared/dateTime";

describe("dateTime utils", () => {
  it("builds local day bounds in UTC ISO format", () => {
    const bounds = localDayBoundsToUtc("2026-04-02");
    expect(bounds.start).toMatch(/T/);
    expect(bounds.end).toMatch(/T/);
    expect(new Date(bounds.start).getTime()).toBeLessThan(new Date(bounds.end).getTime());
    expect(localDateFromIso(bounds.start)).toBe("2026-04-02");
    expect(localDateFromIso(bounds.end)).toBe("2026-04-02");
  });

  it("builds local month bounds", () => {
    const bounds = localMonthBoundsToUtc(2026, 2);
    expect(localDateFromIso(bounds.start)).toBe("2026-02-01");
    expect(localDateFromIso(bounds.end)).toBe("2026-02-28");
  });

  it("converts local date and time to UTC ISO", () => {
    const iso = localDateTimeToUtcIso("2026-04-02", "09:30");
    expect(localDateFromIso(iso)).toBe("2026-04-02");
    expect(new Date(iso).toISOString()).toBe(iso);
  });

  it("adds days using local date semantics", () => {
    expect(addDaysToDateIso("2026-03-31", 1)).toBe("2026-04-01");
    expect(addDaysToDateIso("2026-01-01", -1)).toBe("2025-12-31");
  });
});
