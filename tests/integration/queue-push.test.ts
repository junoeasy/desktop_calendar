import { describe, expect, it } from "vitest";
import { buildQueuePayload } from "../../electron/main/queueMapper";

describe("local create -> queue payload", () => {
  it("creates payload consumable by sync push worker", () => {
    const json = buildQueuePayload("event-1", "primary");
    const parsed = JSON.parse(json) as { eventId: string; calendarProviderId: string };
    expect(parsed.eventId).toBe("event-1");
    expect(parsed.calendarProviderId).toBe("primary");
  });
});
