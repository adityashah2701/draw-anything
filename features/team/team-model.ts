/** Pure helpers for the Team page. No Clerk, no React: this is what the unit tests cover. */

export interface TeamRole {
  key: string;
  name: string;
  description?: string;
}

export interface TeamMember {
  /** Membership id. */
  id: string;
  userId: string;
  name: string;
  email: string;
  imageUrl?: string;
  role: string;
  roleName?: string;
  joinedAt: Date;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: string;
  roleName?: string;
  createdAt: Date;
}

export const ADMIN_ROLE = "org:admin";

/** Used when Clerk cannot list roles (or while they load): the two built-in ones. */
export const DEFAULT_ROLES: TeamRole[] = [
  { key: "org:admin", name: "Admin", description: "Manage members, invitations and workspace settings." },
  { key: "org:member", name: "Member", description: "Open, draw on and share whiteboards." },
];

/** "org:admin" -> "Admin", "org:billing_manager" -> "Billing manager". Prefers the name Clerk gives the role. */
export function roleLabel(role: string, roleName?: string, roles: TeamRole[] = DEFAULT_ROLES): string {
  const known = roles.find((r) => r.key === role)?.name ?? roleName;
  if (known) return known;
  const bare = role.replace(/^org:/, "").replace(/[_-]+/g, " ").trim();
  return bare ? bare.charAt(0).toUpperCase() + bare.slice(1) : "Member";
}

const EMAIL = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;

export interface ParsedEmails {
  valid: string[];
  invalid: string[];
}

/** Splits pasted text on commas, semicolons, spaces and newlines. Lower-cases and de-duplicates. */
export function parseEmails(input: string): ParsedEmails {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,;]+/)) {
    // Pasting from a mail client gives "Name <a@b.co>".
    const token = raw.replace(/^<|>$/g, "").trim();
    if (!token) continue;
    const email = token.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    (EMAIL.test(email) ? valid : invalid).push(token);
  }
  return { valid, invalid };
}

export function displayName(first?: string | null, last?: string | null, fallback = ""): string {
  const full = [first, last].filter(Boolean).join(" ").trim();
  return full || fallback;
}

export function initials(name: string): string {
  const parts = name.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}

export function filterMembers(members: TeamMember[], query: string): TeamMember[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  return members.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5m ago", "3h ago", "2d ago", then a short date. `now` is injected so tests are stable. */
export function timeAgo(date: Date, now = Date.now()): string {
  const diff = Math.max(0, now - date.getTime());
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return shortDate(date);
}

export function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Clerk errors carry a readable message at `errors[0].longMessage`; everything else falls back to the caller's text. */
export function errorMessage(error: unknown, fallback: string): string {
  const e = error as { errors?: { longMessage?: string; message?: string }[]; message?: string } | null;
  return e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? (e?.message && e.message.length < 140 ? e.message : fallback);
}

export function summary(members: number, pending: number): string {
  const parts = [`${members} ${members === 1 ? "member" : "members"}`];
  if (pending > 0) parts.push(`${pending} pending`);
  return parts.join(" · ");
}
