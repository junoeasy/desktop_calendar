import { describe, expect, it } from "vitest";
import { resolveByUpdatedAt } from "../../electron/main/syncUtils";

describe("resolveByUpdatedAt", () => {
  it("prefers local when local is newer", () => {
    const winner = resolveByUpdatedAt("2026-03-03T10:00:00.000Z", "2026-03-03T09:00:00.000Z");
    expect(winner).toBe("local");
  });

  it("prefers remote when remote is newer", () => {
    const winner = resolveByUpdatedAt("2026-03-03T08:00:00.000Z", "2026-03-03T09:00:00.000Z");
    expect(winner).toBe("remote");
  });
});
