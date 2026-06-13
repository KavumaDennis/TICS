/**
 * AssistantChatScreen — AI travel assistant with live trip context.
 * - Auto-scrolls to latest message
 * - Shows typing indicator while Gemini responds
 * - Suggested prompts before first message
 * - Live flight context card
 * - Multiline input with send on return
 */
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '@/src/store/useAuthStore';
import { useAssistantStore } from '@/src/store/assistantStore';
import { useTripStore } from '@/src/store/tripStore';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { greetingFromEmailOrName, ticsDisplayName } from '@/src/utils/displayName';

type ChatMsg = { id: string; role: 'user' | 'assistant'; text: string };

const SUGGESTED = [
  'What is my flight status?',
  "What's the weather at my destination?",
  'Am I at risk of missing my flight?',
  'What should I pack?',
  'Find me alternative flights',
];

export default function AssistantChatScreen() {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const uid  = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const firstName = greetingFromEmailOrName(ticsDisplayName(user));

  const trip = useTripStore((s) =>
    s.activeTripId ? s.trips.find((t) => t.id === s.activeTripId) ?? s.trips[0] ?? null : s.trips[0] ?? null,
  );
  const flightData = useFlightMonitoringStore((s) => trip ? s.byTripId[trip.id] ?? null : null);

  const messages = useAssistantStore((s) => s.messages) as unknown as ChatMsg[];
  const sending  = useAssistantStore((s) => s.sending);
  const error    = useAssistantStore((s) => s.error);
  const startConversation = useAssistantStore((s) => s.startConversation);
  const stopConversation  = useAssistantStore((s) => s.stopConversation);
  const sendMessage       = useAssistantStore((s) => s.sendMessage);

  useEffect(() => {
    if (!uid) { stopConversation(); return; }
    startConversation(uid, trip?.id ?? null);
    return () => stopConversation();
  }, [startConversation, stopConversation, trip?.id, uid]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    }
  }, [messages.length, sending]);

  const flightCard = useMemo(() => {
    if (!trip) return null;
    return {
      title:     `${trip.flightNumber ?? 'Flight'} · ${trip.airline ?? 'Airline'}`,
      route:     `${trip.from} → ${trip.to}`,
      gate:      flightData?.gate ?? '—',
      terminal:  flightData?.terminal ?? '—',
      status:    trip.monitoringStatus === 'at_risk' ? 'At risk' : trip.monitoringStatus === 'unknown' ? 'Unknown' : 'On Track',
      departure: new Date(trip.departureTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };
  }, [trip, flightData]);

  async function send() {
    const text = input.trim();
    if (!text || !uid || sending) return;
    setInput('');
    await sendMessage({ uid, tripId: trip?.id ?? null, text });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a0b1e', paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(59,130,246,0.18)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)', alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="google-assistant" size={22} color="#60A5FA" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 17 }}>AI Assistant</Text>
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }}>
            {trip?.title ?? 'General travel assistant'}
          </Text>
        </View>
        {sending && <ActivityIndicator size={16} color="#60A5FA" />}
      </View>

      {/* ── Messages ── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 14, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Welcome bubble */}
        <View style={{ alignItems: 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '90%' }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(59,130,246,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="google-assistant" size={17} color="#60A5FA" />
            </View>
            <View style={{ flex: 1, borderRadius: 18, borderTopLeftRadius: 4, backgroundColor: 'rgba(59,130,246,0.10)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)', padding: 14 }}>
              <Text style={{ fontFamily: 'Syne_500Medium', color: '#f8fafc', fontSize: 14, lineHeight: 21 }}>
                Hi {firstName}! I have live access to your trip data — gates, delays, weather, and more. What do you need?
              </Text>
            </View>
          </View>
        </View>

        {/* Live context card (shown before first message) */}
        {flightCard && messages.length === 0 && (
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.07)', padding: 16 }}>
            <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#FBBF24', fontSize: 10, letterSpacing: 0.8, marginBottom: 10 }}>
              LIVE TRIP CONTEXT
            </Text>
            <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 14 }}>{flightCard.title}</Text>
            <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12, marginTop: 2 }}>{flightCard.route}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {[
                { label: 'Gate',     value: flightCard.gate,     color: '#60A5FA' },
                { label: 'Terminal', value: flightCard.terminal, color: '#A78BFA' },
                { label: 'Status',   value: flightCard.status,   color: flightCard.status === 'On Track' ? '#22C55E' : '#F59E0B' },
              ].map((item) => (
                <View key={item.label} style={{ flex: 1, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 10 }}>{item.label}</Text>
                  <Text style={{ fontFamily: 'Syne_700Bold', color: item.color, fontSize: 13, marginTop: 3 }}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Suggested prompts */}
        {messages.length === 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontFamily: 'Syne_500Medium', color: '#475569', fontSize: 10, letterSpacing: 0.8 }}>TRY ASKING</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTED.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setInput(s)}
                  style={{ borderRadius: 20, borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)', backgroundColor: 'rgba(59,130,246,0.07)', paddingHorizontal: 12, paddingVertical: 7 }}
                >
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#60A5FA', fontSize: 12 }}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Conversation messages */}
        {messages.map((m) => {
          const isUser = m.role === 'user';
          // Filter out system error messages that start with ⚠️ for cleaner display
          const isError = m.text.startsWith('⚠️');
          return (
            <View key={m.id} style={{ alignItems: isUser ? 'flex-end' : 'flex-start' }}>
              <View style={{ flexDirection: isUser ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, maxWidth: '88%' }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isUser ? 'rgba(139,92,246,0.25)' : 'rgba(59,130,246,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  {isUser
                    ? <Feather name="user" size={14} color="#C4B5FD" />
                    : <MaterialCommunityIcons name="google-assistant" size={16} color="#60A5FA" />}
                </View>
                <View style={{
                  flex: 1,
                  borderRadius: 18,
                  borderTopRightRadius: isUser ? 4 : 18,
                  borderTopLeftRadius:  isUser ? 18 : 4,
                  backgroundColor:  isError ? 'rgba(239,68,68,0.1)'   : isUser ? 'rgba(139,92,246,0.15)' : 'rgba(59,130,246,0.09)',
                  borderWidth: 1,
                  borderColor:      isError ? 'rgba(239,68,68,0.25)'  : isUser ? 'rgba(139,92,246,0.25)' : 'rgba(59,130,246,0.18)',
                  padding: 13,
                }}>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: isError ? '#FCA5A5' : '#f8fafc', fontSize: 14, lineHeight: 21 }}>
                    {m.text}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* Typing indicator */}
        {sending && (
          <View style={{ alignItems: 'flex-start' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(59,130,246,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="google-assistant" size={16} color="#60A5FA" />
              </View>
              <View style={{ borderRadius: 18, borderTopLeftRadius: 4, backgroundColor: 'rgba(59,130,246,0.09)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.18)', paddingHorizontal: 18, paddingVertical: 14 }}>
                <ActivityIndicator size="small" color="#60A5FA" />
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Input bar ── */}
      <View style={{
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
        backgroundColor: '#0d0e23',
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
      }}>
        <View style={{ flex: 1, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 8, minHeight: 46, justifyContent: 'center' }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={sending ? 'Thinking…' : 'Ask anything about your trip…'}
            placeholderTextColor="rgba(248,250,252,0.3)"
            style={{ fontFamily: 'Syne_500Medium', color: '#f8fafc', fontSize: 14, maxHeight: 120 }}
            multiline
            editable={!sending}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={send}
          />
        </View>
        <Pressable
          onPress={send}
          disabled={sending || !input.trim()}
          style={{
            width: 46, height: 46, borderRadius: 23,
            backgroundColor: input.trim() && !sending ? '#F59E0B' : 'rgba(255,255,255,0.07)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="send" size={18} color={input.trim() && !sending ? 'rgba(10,11,30,0.9)' : 'rgba(248,250,252,0.25)'} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
