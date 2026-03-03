import { describe, expect, it } from "vitest";
import { computeRetryDelaySeconds } from "../../electron/main/syncUtils";

describe("computeRetryDelaySeconds", () => {
  it("backs off exponentially and caps at 300s", () => {
    expect(computeRetryDelaySeconds(1)).toBe(10);
    expect(computeRetryDelaySeconds(2)).toBe(20);
    expect(computeRetryDelaySeconds(10)).toBe(300);
  });
});
