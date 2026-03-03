import { describe, expect, it } from "vitest";
import { monthMatrix } from "../../src/lib/day";

describe("monthMatrix", () => {
  it("always returns 42 cells", () => {
    const cells = monthMatrix(2026, 3);
    expect(cells).toHaveLength(42);
  });
});
