import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '@/src/firebase/firebaseApp';

export type AssistantHistoryItem = { role: 'user' | 'assistant'; text: string };

export type AlertContext = {
  alertTitle: string;
  alertMessage: string;
  alertSeverity: string;
  alertCategory?: string;
  alertSource?: string;
  recommendation?: string;
};

export type DestinationContext = {
  destination: string;
  departureDate: string;
  returnDate?: string;
  weather?: string;
  tempC?: number;
  description?: string;
  flightNumber?: string;
  airline?: string;
};

/** AI assistant chat */
export async function assistantChat(input: {
  message: string;
  tripId?: string | null;
  conversationId?: string | null;
  history?: AssistantHistoryItem[];
  /** Prompt instruction prefix, e.g. "Analyze this alert for the user" */
  instruction?: string;
}) {
  const fn = httpsCallable(getFirebaseFunctions(), 'assistantChat');
  const res = await fn(input);
  const data: any = res.data;
  return {
    answer: String(data?.answer ?? ''),
    conversationId: data?.conversationId ? String(data.conversationId) : null,
  };
}

/** Ensure user Firestore document exists */
export async function ensureUserDoc() {
  const fn = httpsCallable(getFirebaseFunctions(), 'ensureUserDoc');
  const res = await fn({});
  return Boolean((res.data as any)?.ok);
}

/** Register Expo push token */
export async function registerPushToken(token: string) {
  const fn = httpsCallable(getFirebaseFunctions(), 'registerPushToken');
  const res = await fn({ token });
  return Boolean((res.data as any)?.ok);
}

/** Trigger full monitoring cycle for a trip */
export async function refreshTripMonitoring(tripId: string): Promise<{ ok: boolean }> {
  const fn = httpsCallable(getFirebaseFunctions(), 'refreshTripMonitoring');
  const res = await fn({ tripId });
  return { ok: Boolean((res.data as any)?.ok) };
}

/** Save an item (alert/recommendation/insight) to the user's saved list */
export async function saveItem(input: {
  itemId: string;
  itemType: 'alert' | 'recommendation' | 'insight';
  tripId: string;
  data: Record<string, unknown>;
}): Promise<{ ok: boolean; savedId: string }> {
  const fn = httpsCallable(getFirebaseFunctions(), 'saveItem');
  const res = await fn(input);
  const data: any = res.data;
  return { ok: Boolean(data?.ok), savedId: String(data?.savedId ?? '') };
}

/** Remove a saved item from the user's saved list */
export async function unsaveItem(input: {
  itemId: string;
}): Promise<{ ok: boolean }> {
  const fn = httpsCallable(getFirebaseFunctions(), 'unsaveItem');
  const res = await fn(input);
  return { ok: Boolean((res.data as any)?.ok) };
}

/** Submit an app rating (1–5 stars) */
export async function submitAppRating(stars: number, feedback?: string): Promise<{ ok: boolean }> {
  const fn = httpsCallable(getFirebaseFunctions(), 'submitAppRating');
  const res = await fn({ stars, feedback });
  return { ok: Boolean((res.data as any)?.ok) };
}

/** Generate a shareable trip update text */
export async function generateShareUpdate(tripId: string): Promise<{ ok: boolean; shareText: string }> {
  const fn = httpsCallable(getFirebaseFunctions(), 'generateShareUpdate');
  const res = await fn({ tripId });
  const data: any = res.data;
  return { ok: Boolean(data?.ok), shareText: String(data?.shareText ?? '') };
}

/** Generate destination tips via AI */
export async function generateDestinationTips(destination: string, tripData: Record<string, unknown>): Promise<string> {
  const fn = httpsCallable(getFirebaseFunctions(), 'generateDestinationTips');
  const res = await fn({ destination, tripData });
  const data: any = res.data;
  return String(data?.tips ?? '');
}

/** Sync a trip from email content (Gmail/Outlook) */
export async function syncFromEmail(input: {
  subject: string;
  body: string;
  source: 'gmail' | 'outlook';
  emailId?: string;
}): Promise<{ ok: boolean; reason?: string; tripId?: string; trip?: Record<string, unknown> }> {
  const fn = httpsCallable(getFirebaseFunctions(), 'syncFromEmail');
  const res = await fn(input);
  const data: any = res.data;
  return {
    ok: Boolean(data?.ok),
    reason: data?.reason ? String(data.reason) : undefined,
    tripId: data?.tripId ? String(data.tripId) : undefined,
    trip: data?.trip ?? undefined,
  };
}

/** Import a trip from a booking confirmation (Expedia, Booking.com, etc.) */
export async function importFromBooking(input: {
  subject: string;
  body: string;
  fromEmail?: string;
}): Promise<{ ok: boolean; reason?: string; tripId?: string; trip?: Record<string, unknown> }> {
  const fn = httpsCallable(getFirebaseFunctions(), 'importFromBooking');
  const res = await fn(input);
  const data: any = res.data;
  return {
    ok: Boolean(data?.ok),
    reason: data?.reason ? String(data.reason) : undefined,
    tripId: data?.tripId ? String(data.tripId) : undefined,
    trip: data?.trip ?? undefined,
  };
}
