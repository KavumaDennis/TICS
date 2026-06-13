import type { AuthUser } from '@/src/store/useAuthStore';

/** Part before @ in email — used when no saved display name exists. */
export function emailLocalPart(email: string | null | undefined): string {
  const e = (email ?? '').trim();
  const idx = e.indexOf('@');
  if (idx <= 0) return 'Traveler';
  const local = e.slice(0, idx).trim();
  return local || 'Traveler';
}

/** Saved profile name, otherwise email local-part (never placeholder names). */
export function ticsDisplayName(user: AuthUser | null | undefined): string {
  if (!user) return 'Traveler';
  const n = user.name?.trim();
  if (n) return n;
  return emailLocalPart(user.email);
}

/**
 * Returns the first name only for greeting text.
 * "Dennis Kavumma" → "Dennis"
 * "dennis.kavumma@gmail.com" → "dennis"
 * Capitalizes the first letter.
 */
export function greetingFromEmailOrName(display: string): string {
  if (!display) return 'Traveler';
  // Take only first word (first name)
  const firstName = display.trim().split(/[\s._@]+/)[0] ?? 'Traveler';
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}
