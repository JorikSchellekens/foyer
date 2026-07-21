export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "0 secs";
  if (seconds < 60) return `${Math.round(seconds)} secs`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60)
    return `${mins}:${secs.toString().padStart(2, "0")} mins`;
  const hours = Math.floor(mins / 60);
  return `${hours}:${(mins % 60).toString().padStart(2, "0")} hrs`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  const v = bytes / 1024 ** i;
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function initials(nameOrEmail: string): string {
  const s = nameOrEmail.trim();
  if (!s) return "?";
  const at = s.indexOf("@");
  const base = at > 0 ? s.slice(0, at) : s;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export function pluralize(n: number, singular: string, plural?: string) {
  return `${n} ${n === 1 ? singular : plural ?? `${singular}s`}`;
}
