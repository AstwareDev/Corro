const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;








export function formatDuration(ms: number, { precise = false } = {}): string {
  const value = Math.max(0, ms);

  if (value >= DAY) {
    const days = Math.floor(value / DAY);
    const hours = Math.floor((value % DAY) / HOUR);
    return hours ? `${days}d ${hours}h` : `${days}d`;
  }

  if (value >= HOUR) {
    const hours = Math.floor(value / HOUR);
    const minutes = Math.floor((value % HOUR) / MINUTE);
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (value >= MINUTE) {
    const minutes = Math.floor(value / MINUTE);
    const seconds = Math.round((value % MINUTE) / SECOND);
    
    if (seconds === 60) return `${minutes + 1}m`;
    return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  if (precise) {
    if (value < SECOND) return `${Math.round(value)}ms`;
    return `${(value / SECOND).toFixed(1)}s`;
  }

  const seconds = Math.max(1, Math.round(value / SECOND));
  
  return seconds === 60 ? "1m" : `${seconds}s`;
}



export function formatRelativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "Just now";
  if (ms < 45 * SECOND) return "Just now";
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}m ago`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h ago`;
  if (ms < 7 * DAY) return `${Math.round(ms / DAY)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
