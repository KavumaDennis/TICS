/**
 * TripTypeAwareComponents.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable, trip-type-aware components for Budget Planner, Notifications,
 * Travel Documents, Journey Progress, AI Journey Builder, and Maps.
 *
 * Each component automatically adapts its content based on trip.type.
 * No classification logic lives here — it uses the useTripType hook.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTripType, TripType, type TripTypeInfo } from '@/src/hooks/useTripType';
import type { Trip } from '@/src/store/tripStore';
import { SafeText } from '@/src/components/responsive/SafeText';

/* ════════════════════════════════════════════════════════════════════════════ */
/*  BUDGET PLANNER                                                             */
/* ════════════════════════════════════════════════════════════════════════════ */

interface BudgetCategory {
  icon: string;
  label: string;
  estimated: string;
  color: string;
}

const LOCAL_BUDGET: BudgetCategory[] = [
  { icon: 'flash-outline', label: 'Fuel', estimated: 'UGX 35,000', color: '#F59E0B' },
  { icon: 'trail-sign-outline', label: 'Road Tolls', estimated: 'UGX 5,000', color: '#94A3B8' },
  { icon: 'restaurant-outline', label: 'Food', estimated: 'UGX 30,000', color: '#22C55E' },
  { icon: 'bed-outline', label: 'Accommodation', estimated: 'UGX 80,000', color: '#EC4899' },
  { icon: 'walk-outline', label: 'Activities', estimated: 'UGX 20,000', color: '#3B82F6' },
  { icon: 'business-outline', label: 'Parking', estimated: 'UGX 5,000', color: '#8B5CF6' },
];

const REGIONAL_BUDGET: BudgetCategory[] = [
  { icon: 'flash-outline', label: 'Fuel', estimated: 'UGX 80,000', color: '#F59E0B' },
  { icon: 'trail-sign-outline', label: 'Border Fees', estimated: 'UGX 20,000', color: '#F97316' },
  { icon: 'bed-outline', label: 'Accommodation', estimated: 'UGX 100,000', color: '#EC4899' },
  { icon: 'umbrella-outline', label: 'Insurance', estimated: 'UGX 15,000', color: '#14B8A6' },
  { icon: 'cash-outline', label: 'Currency Exchange', estimated: 'UGX 5,000', color: '#A78BFA' },
  { icon: 'wifi-outline', label: 'SIM Card', estimated: 'UGX 10,000', color: '#60A5FA' },
  { icon: 'restaurant-outline', label: 'Meals', estimated: 'UGX 50,000', color: '#22C55E' },
  { icon: 'walk-outline', label: 'Activities', estimated: 'UGX 40,000', color: '#3B82F6' },
];

const INTERNATIONAL_BUDGET: BudgetCategory[] = [
  { icon: 'airplane-outline', label: 'Flights', estimated: 'USD 500', color: '#3B82F6' },
  { icon: 'bed-outline', label: 'Hotels', estimated: 'USD 300', color: '#EC4899' },
  { icon: 'card-outline', label: 'Visa', estimated: 'USD 50', color: '#F59E0B' },
  { icon: 'umbrella-outline', label: 'Insurance', estimated: 'USD 30', color: '#14B8A6' },
  { icon: 'car-outline', label: 'Airport Transfer', estimated: 'USD 20', color: '#A855F7' },
  { icon: 'restaurant-outline', label: 'Meals', estimated: 'USD 200', color: '#22C55E' },
  { icon: 'bus-outline', label: 'Local Transport', estimated: 'USD 50', color: '#8B5CF6' },
  { icon: 'walk-outline', label: 'Activities', estimated: 'USD 150', color: '#3B82F6' },
  { icon: 'cart-outline', label: 'Shopping', estimated: 'USD 100', color: '#F97316' },
  { icon: 'shield-outline', label: 'Emergency Reserve', estimated: 'USD 100', color: '#EF4444' },
];

export function TripBudgetPlanner({ trip }: { trip: Trip | null }) {
  const { tripType, isLocal, isRegional, isInternational } = useTripType(trip);

  const budget = useMemo(() => {
    if (isLocal) return LOCAL_BUDGET;
    if (isRegional) return REGIONAL_BUDGET;
    return INTERNATIONAL_BUDGET;
  }, [isLocal, isRegional, isInternational]);

  const total = useMemo(() => {
    return budget.reduce((sum, item) => {
      const num = parseFloat(item.estimated.replace(/[^0-9.]/g, ''));
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
  }, [budget]);

  return (
    <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-4xl" style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="wallet-outline" size={16} color="#22C55E" />
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 12, letterSpacing: 0.8 }}>
          BUDGET PLANNER · {tripType}
        </SafeText>
      </View>

      {budget.map((item) => (
        <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name={item.icon as any} size={14} color={item.color} />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12 }}>{item.label}</SafeText>
          </View>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 12 }}>{item.estimated}</SafeText>
        </View>
      ))}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 13 }}>Estimated Total</SafeText>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 15 }}>
          {isLocal || isRegional ? `UGX ${total.toLocaleString()}` : `USD ${total.toLocaleString()}`}
        </SafeText>
      </View>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  NOTIFICATIONS / ALERTS                                                     */
/* ════════════════════════════════════════════════════════════════════════════ */

interface NotificationSuggestion {
  icon: string;
  title: string;
  description: string;
  color: string;
}

const LOCAL_NOTIFICATIONS: NotificationSuggestion[] = [
  { icon: 'car-outline', title: 'Heavy traffic ahead', description: 'Alternative route suggested', color: '#F59E0B' },
  { icon: 'rainy-outline', title: 'Rain expected', description: 'Pack an umbrella', color: '#3B82F6' },
  { icon: 'close-circle-outline', title: 'Road closure', description: 'Find alternate route', color: '#EF4444' },
  { icon: 'flash-outline', title: 'Fuel station nearby', description: 'Last station for 50 km', color: '#22C55E' },
  { icon: 'restaurant-outline', title: 'Restaurant nearby', description: 'Recommended stop', color: '#F59E0B' },
];

const REGIONAL_NOTIFICATIONS: NotificationSuggestion[] = [
  { icon: 'trail-sign-outline', title: 'Border delays', description: 'Expected wait: 45 min', color: '#F97316' },
  { icon: 'cash-outline', title: 'Currency exchange reminder', description: 'Exchange before crossing', color: '#14B8A6' },
  { icon: 'documents-outline', title: 'Passport reminder', description: 'Keep passport accessible', color: '#8B5CF6' },
  { icon: 'wifi-outline', title: 'Roaming reminder', description: 'Activate international plan', color: '#60A5FA' },
  { icon: 'alert-circle-outline', title: 'Travel advisory', description: 'Check latest updates', color: '#F59E0B' },
];

const INTERNATIONAL_NOTIFICATIONS: NotificationSuggestion[] = [
  { icon: 'airplane-outline', title: 'Flight delayed', description: 'New departure time: TBD', color: '#EF4444' },
  { icon: 'time-outline', title: 'Check-in opens', description: 'Online check-in available', color: '#3B82F6' },
  { icon: 'enter-outline', title: 'Gate changed', description: 'Check departure boards', color: '#F59E0B' },
  { icon: 'documents-outline', title: 'Immigration reminder', description: 'Have documents ready', color: '#8B5CF6' },
  { icon: 'alert-circle-outline', title: 'Passport expires soon', description: 'Renew before travel', color: '#EF4444' },
  { icon: 'rainy-outline', title: 'Weather alert', description: 'Check destination forecast', color: '#3B82F6' },
  { icon: 'bed-outline', title: 'Hotel check-in', description: 'Check-in time: 2:00 PM', color: '#EC4899' },
  { icon: 'cash-outline', title: 'Currency reminder', description: 'Exchange before departure', color: '#14B8A6' },
  { icon: 'time-outline', title: 'Timezone reminder', description: 'Set alarms for new timezone', color: '#A78BFA' },
];

export function TripNotifications({ trip }: { trip: Trip | null }) {
  const { tripType, isLocal, isRegional, isInternational } = useTripType(trip);

  const notifications = useMemo(() => {
    if (isLocal) return LOCAL_NOTIFICATIONS;
    if (isRegional) return REGIONAL_NOTIFICATIONS;
    return INTERNATIONAL_NOTIFICATIONS;
  }, [isLocal, isRegional, isInternational]);

  return (
    <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-4xl" style={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="notifications-outline" size={16} color="#F59E0B" />
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F59E0B', fontSize: 12, letterSpacing: 0.8 }}>
          NOTIFICATIONS · {tripType}
        </SafeText>
      </View>

      {notifications.map((note) => (
        <View key={note.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: note.color + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={note.icon as any} size={14} color={note.color} />
          </View>
          <View style={{ flex: 1 }}>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 13 }}>{note.title}</SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>{note.description}</SafeText>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TRAVEL DOCUMENTS                                                           */
/* ════════════════════════════════════════════════════════════════════════════ */

interface DocumentItem {
  icon: string;
  label: string;
  required: boolean;
  color: string;
}

const LOCAL_DOCUMENTS: DocumentItem[] = [
  { icon: 'card-outline', label: 'National ID', required: true, color: '#22C55E' },
  { icon: 'car-outline', label: 'Driving Permit', required: true, color: '#3B82F6' },
];

const REGIONAL_DOCUMENTS: DocumentItem[] = [
  { icon: 'card-outline', label: 'National ID', required: true, color: '#22C55E' },
  { icon: 'documents-outline', label: 'Passport', required: true, color: '#F59E0B' },
  { icon: 'car-outline', label: 'Vehicle Documents', required: true, color: '#3B82F6' },
  { icon: 'umbrella-outline', label: 'Insurance', required: true, color: '#14B8A6' },
];

const INTERNATIONAL_DOCUMENTS: DocumentItem[] = [
  { icon: 'documents-outline', label: 'Passport', required: true, color: '#3B82F6' },
  { icon: 'card-outline', label: 'Visa', required: true, color: '#F59E0B' },
  { icon: 'medkit-outline', label: 'Vaccination Certificate', required: true, color: '#22C55E' },
  { icon: 'umbrella-outline', label: 'Travel Insurance', required: true, color: '#14B8A6' },
  { icon: 'airplane-outline', label: 'Boarding Pass', required: true, color: '#A78BFA' },
  { icon: 'bed-outline', label: 'Hotel Reservation', required: true, color: '#EC4899' },
  { icon: 'call-outline', label: 'Emergency Contacts', required: true, color: '#EF4444' },
];

export function TripTravelDocuments({ trip }: { trip: Trip | null }) {
  const { tripType, isLocal, isRegional, isInternational } = useTripType(trip);

  const documents = useMemo(() => {
    if (isLocal) return LOCAL_DOCUMENTS;
    if (isRegional) return REGIONAL_DOCUMENTS;
    return INTERNATIONAL_DOCUMENTS;
  }, [isLocal, isRegional, isInternational]);

  if (isLocal && documents.length === 0) {
    return (
      <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-4xl" style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="documents-outline" size={16} color="#64748B" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748B', fontSize: 12, letterSpacing: 0.8 }}>
            TRAVEL DOCUMENTS
          </SafeText>
        </View>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, marginTop: 8 }}>
          No special documents required for local travel. Just bring your ID.
        </SafeText>
      </View>
    );
  }

  return (
    <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-4xl" style={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="documents-outline" size={16} color="#F59E0B" />
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F59E0B', fontSize: 12, letterSpacing: 0.8 }}>
          REQUIRED DOCUMENTS · {tripType}
        </SafeText>
      </View>

      {documents.map((doc) => (
        <View key={doc.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: doc.color + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={doc.icon as any} size={14} color={doc.color} />
          </View>
          <View style={{ flex: 1 }}>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 13 }}>{doc.label}</SafeText>
          </View>
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: doc.required ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)' }}>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontSize: 10, color: doc.required ? '#22C55E' : '#64748B' }}>
              {doc.required ? 'Required' : 'Optional'}
            </SafeText>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  JOURNEY PROGRESS                                                           */
/* ════════════════════════════════════════════════════════════════════════════ */

interface ProgressPhase {
  label: string;
  icon: string;
  color: string;
}

const LOCAL_PROGRESS: ProgressPhase[] = [
  { label: 'Preparing', icon: 'time-outline', color: '#94A3B8' },
  { label: 'Travelling', icon: 'car-outline', color: '#3B82F6' },
  { label: 'At Destination', icon: 'location-outline', color: '#22C55E' },
  { label: 'Returning', icon: 'return-down-back-outline', color: '#F59E0B' },
  { label: 'Completed', icon: 'checkmark-circle-outline', color: '#22C55E' },
];

const REGIONAL_PROGRESS: ProgressPhase[] = [
  { label: 'Preparing', icon: 'time-outline', color: '#94A3B8' },
  { label: 'Travelling', icon: 'car-outline', color: '#3B82F6' },
  { label: 'Border Crossing', icon: 'trail-sign-outline', color: '#F97316' },
  { label: 'Destination', icon: 'location-outline', color: '#22C55E' },
  { label: 'Returning', icon: 'return-down-back-outline', color: '#F59E0B' },
  { label: 'Completed', icon: 'checkmark-circle-outline', color: '#22C55E' },
];

const INTERNATIONAL_PROGRESS: ProgressPhase[] = [
  { label: 'Planning', icon: 'time-outline', color: '#94A3B8' },
  { label: 'Visa', icon: 'card-outline', color: '#F59E0B' },
  { label: 'Booking', icon: 'calendar-outline', color: '#3B82F6' },
  { label: 'Packing', icon: 'briefcase-outline', color: '#A78BFA' },
  { label: 'Airport', icon: 'airplane-outline', color: '#F97316' },
  { label: 'Flight', icon: 'airplane', color: '#60A5FA' },
  { label: 'Arrival', icon: 'location-outline', color: '#22C55E' },
  { label: 'Hotel', icon: 'bed-outline', color: '#EC4899' },
  { label: 'Exploring', icon: 'walk-outline', color: '#14B8A6' },
  { label: 'Return Flight', icon: 'airplane-outline', color: '#3B82F6' },
  { label: 'Completed', icon: 'checkmark-circle-outline', color: '#22C55E' },
];

export function TripJourneyProgress({ trip, currentPhase = 0 }: { trip: Trip | null; currentPhase?: number }) {
  const { tripType, isLocal, isRegional, isInternational } = useTripType(trip);

  const phases = useMemo(() => {
    if (isLocal) return LOCAL_PROGRESS;
    if (isRegional) return REGIONAL_PROGRESS;
    return INTERNATIONAL_PROGRESS;
  }, [isLocal, isRegional, isInternational]);

  return (
    <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-4xl" style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="pulse-outline" size={16} color="#3B82F6" />
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#3B82F6', fontSize: 12, letterSpacing: 0.8 }}>
          JOURNEY PROGRESS · {tripType}
        </SafeText>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {phases.map((phase, index) => {
          const isActive = index === currentPhase;
          const isPast = index < currentPhase;
          return (
            <View key={phase.label} style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99,
              backgroundColor: isActive ? phase.color + '30' : isPast ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.04)',
              borderWidth: 1,
              borderColor: isActive ? phase.color + '50' : isPast ? 'rgba(34,197,94,0.20)' : 'rgba(255,255,255,0.06)',
            }}>
              <Ionicons name={phase.icon as any} size={10} color={isActive ? phase.color : isPast ? '#22C55E' : '#64748B'} />
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontSize: 10, color: isActive ? phase.color : isPast ? '#22C55E' : '#64748B' }}>
                {phase.label}
              </SafeText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  AI JOURNEY BUILDER SUGGESTIONS                                            */
/* ════════════════════════════════════════════════════════════════════════════ */

interface AISuggestion {
  icon: string;
  title: string;
  description: string;
  color: string;
}

const LOCAL_AI_SUGGESTIONS: AISuggestion[] = [
  { icon: 'car-outline', title: 'Road trip routes', description: 'Scenic driving routes recommended', color: '#22C55E' },
  { icon: 'calendar-outline', title: 'Weekend escapes', description: 'Nearby getaways for the weekend', color: '#3B82F6' },
  { icon: 'trail-sign-outline', title: 'Nearby attractions', description: 'Must-visit places along your route', color: '#F59E0B' },
  { icon: 'flash-outline', title: 'Fuel stops', description: 'Best fuel stations en route', color: '#F97316' },
  { icon: 'map-outline', title: 'Driving routes', description: 'Optimal driving directions', color: '#8B5CF6' },
];

const REGIONAL_AI_SUGGESTIONS: AISuggestion[] = [
  { icon: 'trail-sign-outline', title: 'Border crossing tips', description: 'Smooth crossing procedures', color: '#F97316' },
  { icon: 'bed-outline', title: 'Hotels', description: 'Recommended accommodation', color: '#EC4899' },
  { icon: 'cash-outline', title: 'Currency tips', description: 'Best exchange rates', color: '#14B8A6' },
  { icon: 'trail-sign-outline', title: 'Regional attractions', description: 'Must-see destinations', color: '#3B82F6' },
  { icon: 'car-outline', title: 'Driving regulations', description: 'Local driving rules to know', color: '#F59E0B' },
];

const INTERNATIONAL_AI_SUGGESTIONS: AISuggestion[] = [
  { icon: 'airplane-outline', title: 'Flight recommendations', description: 'Best flight options and airlines', color: '#3B82F6' },
  { icon: 'bed-outline', title: 'Accommodation', description: 'Top-rated hotels and stays', color: '#EC4899' },
  { icon: 'card-outline', title: 'Visa assistance', description: 'Visa requirements and process', color: '#F59E0B' },
  { icon: 'umbrella-outline', title: 'Travel insurance', description: 'Recommended coverage plans', color: '#14B8A6' },
  { icon: 'car-outline', title: 'Airport transfers', description: 'Reliable transfer options', color: '#A855F7' },
  { icon: 'briefcase-outline', title: 'Packing tips', description: 'What to pack for your trip', color: '#A78BFA' },
  { icon: 'chatbubbles-outline', title: 'Language tips', description: 'Essential local phrases', color: '#60A5FA' },
  { icon: 'shield-outline', title: 'Safety advice', description: 'Local safety guidelines', color: '#22C55E' },
  { icon: 'book-outline', title: 'Cultural etiquette', description: 'Respect local customs', color: '#F97316' },
];

export function TripAIBuilder({ trip }: { trip: Trip | null }) {
  const { tripType, isLocal, isRegional, isInternational } = useTripType(trip);

  const suggestions = useMemo(() => {
    if (isLocal) return LOCAL_AI_SUGGESTIONS;
    if (isRegional) return REGIONAL_AI_SUGGESTIONS;
    return INTERNATIONAL_AI_SUGGESTIONS;
  }, [isLocal, isRegional, isInternational]);

  return (
    <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-4xl" style={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="sparkles-outline" size={16} color="#A78BFA" />
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 12, letterSpacing: 0.8 }}>
          AI JOURNEY BUILDER · {tripType}
        </SafeText>
      </View>

      {suggestions.map((suggestion) => (
        <Pressable key={suggestion.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: suggestion.color + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={suggestion.icon as any} size={16} color={suggestion.color} />
          </View>
          <View style={{ flex: 1 }}>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 13 }}>{suggestion.title}</SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>{suggestion.description}</SafeText>
          </View>
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.2)" />
        </Pressable>
      ))}
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  MAPS                                                                       */
/* ════════════════════════════════════════════════════════════════════════════ */

export function TripMaps({ trip }: { trip: Trip | null }) {
  const { tripType, isLocal, isRegional, isInternational } = useTripType(trip);

  const mapFeatures = useMemo(() => {
    if (isLocal) {
      return [
        { icon: 'map-outline', label: 'Google Maps Navigation', color: '#22C55E' },
        { icon: 'car-outline', label: 'Live Traffic', color: '#3B82F6' },
        { icon: 'flash-outline', label: 'Fuel Stations', color: '#F59E0B' },
        { icon: 'restaurant-outline', label: 'Restaurants', color: '#F97316' },
        { icon: 'business-outline', label: 'Nearby Services', color: '#8B5CF6' },
      ];
    }
    if (isRegional) {
      return [
        { icon: 'map-outline', label: 'Road Routes', color: '#22C55E' },
        { icon: 'trail-sign-outline', label: 'Border Crossings', color: '#F97316' },
        { icon: 'flash-outline', label: 'Fuel Stations', color: '#F59E0B' },
        { icon: 'alert-circle-outline', label: 'Road Advisories', color: '#EF4444' },
      ];
    }
    return [
      { icon: 'airplane-outline', label: 'Airport Maps', color: '#3B82F6' },
      { icon: 'subway-outline', label: 'Metro / Train', color: '#F59E0B' },
      { icon: 'bus-outline', label: 'Bus Routes', color: '#22C55E' },
      { icon: 'walk-outline', label: 'Walking Directions', color: '#14B8A6' },
      { icon: 'car-outline', label: 'Taxi / Ride-hailing', color: '#A855F7' },
      { icon: 'bed-outline', label: 'Hotels', color: '#EC4899' },
    ];
  }, [isLocal, isRegional, isInternational]);

  return (
    <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-4xl" style={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="map-outline" size={16} color="#22C55E" />
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 12, letterSpacing: 0.8 }}>
          MAPS · {tripType}
        </SafeText>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {mapFeatures.map((feature) => (
          <View key={feature.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: feature.color + '15', borderWidth: 1, borderColor: feature.color + '30' }}>
            <Ionicons name={feature.icon as any} size={12} color={feature.color} />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontSize: 11, color: feature.color }}>{feature.label}</SafeText>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TRIP TYPE BADGE                                                            */
/* ════════════════════════════════════════════════════════════════════════════ */

export function TripTypeBadge({ trip }: { trip: Trip | null }) {
  const { tripType, isLocal, isRegional, isInternational } = useTripType(trip);

  const config = {
    [TripType.LOCAL]: { label: 'Local Trip', color: '#22C55E', bg: 'rgba(34,197,94,0.15)', icon: 'car-outline' },
    [TripType.REGIONAL]: { label: 'Regional Trip', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', icon: 'earth-outline' },
    [TripType.INTERNATIONAL]: { label: 'International', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)', icon: 'airplane-outline' },
  }[tripType];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: config.bg }}>
      <Ionicons name={config.icon as any} size={12} color={config.color} />
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontSize: 10, color: config.color }}>{config.label}</SafeText>
    </View>
  );
}