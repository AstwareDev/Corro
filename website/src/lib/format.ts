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



export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}



const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function formatSearchBucket(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const now = new Date();
  const diff = now.getTime() - time;
  if (diff < HOUR_MS) return "Past hour";
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startDay = new Date(time);
  startDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startToday.getTime() - startDay.getTime()) / DAY_MS,
  );
  if (dayDiff <= 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (diff < 7 * DAY_MS) return "Past week";
  if (diff < 30 * DAY_MS) return "Past month";
  const date = new Date(time);
  return date.toLocaleDateString(
    undefined,
    date.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
}
