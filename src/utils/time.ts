// Utility to produce ISO timestamps in UTC+8 (local timezone used by backend)
export function localIso(): string {
  const d = new Date();
  const tzOffsetMs = 8 * 60 * 60 * 1000; // +08:00
  const local = new Date(d.getTime() + tzOffsetMs);
  // toISOString returns YYYY-MM-DDTHH:mm:ss.sssZ — replace trailing Z with +08:00
  return local.toISOString().replace(/Z$/, '+08:00');
}
