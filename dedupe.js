// Simple in-memory deduplication
const lastPunches = new Set();

export function isDuplicate(log) {
  const key = `${log.userId}_${log.timestamp}`;
  if (lastPunches.has(key)) return true;
  lastPunches.add(key);

  if (lastPunches.size > 5000) {
    const first = lastPunches.values().next().value;
    lastPunches.delete(first);
  }

  return false;
}
