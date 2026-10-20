/** "just now", "5 min ago", "3 h ago", "Yesterday", "4 d ago", then a short date. */
export const formatRelative = (timestamp: number, now: number = Date.now()): string => {
  const minutes = Math.floor((now - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
