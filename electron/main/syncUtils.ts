export function computeRetryDelaySeconds(attempts: number) {
  return Math.min(300, Math.pow(2, attempts) * 5);
}

export function resolveByUpdatedAt(localUpdatedAt: string, remoteUpdatedAt: string | null) {
  const local = new Date(localUpdatedAt).getTime();
  const remote = remoteUpdatedAt ? new Date(remoteUpdatedAt).getTime() : 0;
  return local >= remote ? "local" : "remote";
}
