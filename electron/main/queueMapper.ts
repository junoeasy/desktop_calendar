export function buildQueuePayload(eventId: string, calendarProviderId: string) {
  return JSON.stringify({ eventId, calendarProviderId });
}
