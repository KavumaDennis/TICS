/**
 * AssistantChatScreen — AI travel assistant with live trip context.
 * - Auto-scrolls to latest message
 * - Shows typing indicator while Gemini responds
 * - Suggested prompts before first message
 * - Live flight context card
 * - Multiline input with send on return
 * - Auto-sends pendingInitialMessage from store when navigated from AI buttons
 */
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useWeatherStore } from '@/src/store/weatherStore';
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
  const autoSendAttemptedRef = useRef(false);

  const uid = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const firstName = greetingFromEmailOrName(ticsDisplayName(user));

  const trips = useTripStore((s) => s.trips);
  const activeTripId = useTripStore((s) => s.activeTripId);
  const trip = useMemo(() => {
    return activeTripId ? trips.find((t) => t.id === activeTripId) ?? trips[0] ?? null : trips[0] ?? null;
  }, [activeTripId, trips]);
  const flightData = useFlightMonitoringStore((s) => trip ? s.byTripId[trip.id] ?? null : null);

  const messages = useAssistantStore((s) => s.messages) as unknown as ChatMsg[];
  const sending = useAssistantStore((s) => s.sending);
  const loading = useAssistantStore((s) => s.loading);
  const startConversation = useAssistantStore((s) => s.startConversation);
  const stopConversation = useAssistantStore((s) => s.stopConversation);
  const sendMessage = useAssistantStore((s) => s.sendMessage);

  // Step 1: Start conversation on mount
  useEffect(() => {
    if (!uid) {
      console.log('[AssistantChatScreen] No uid, stopping conversation');
      stopConversation();
      return;
    }
    console.log('[AssistantChatScreen] Starting conversation', { uid, tripId: trip?.id ?? null });
    startConversation(uid, trip?.id ?? null);
    return () => {
      console.log('[AssistantChatScreen] Cleanup - stopping conversation');
      stopConversation();
    };
  }, [startConversation, stopConversation, uid]); // Only depend on uid, not trip.id

  // Step 2: Auto-send pending initial message - simpler, more reliable approach
  useEffect(() => {
    if (!uid) return;

    // Check store directly on each render cycle
    const pendingMsg = useAssistantStore.getState().pendingInitialMessage;
    const pendingTripId = useAssistantStore.getState().pendingTripId;

    console.log('[AssistantChatScreen] Auto-send check (direct store read)', {
      pendingMsg: pendingMsg ? pendingMsg.substring(0, 50) + '...' : null,
      pendingTripId,
      autoSendAttempted: autoSendAttemptedRef.current,
      loading,
      sending,
      messagesCount: messages.length,
      conversationReady: !loading && messages.length > 0,
    });

    // Only proceed if there's a pending message and we haven't attempted yet
    if (!pendingMsg || autoSendAttemptedRef.current) return;

    // Wait for conversation to be ready (not loading AND has at least the initial message listener)
    if (loading) return;

    // Mark as attempted immediately to prevent any duplicate sends
    autoSendAttemptedRef.current = true;

    const msgToSend = pendingMsg;

    console.log('[AssistantChatScreen] Clearing pending and preparing auto-send', {
      msgPreview: msgToSend.substring(0, 80) + '...',
    });

    // Clear the pending state from store
    useAssistantStore.getState().clearPendingMessage();

    // Schedule the actual send after a delay to ensure Firestore listener is settled
    const timer = setTimeout(async () => {
      console.log('[AssistantChatScreen] Executing auto-send now');
      try {
        await sendMessage({
          uid,
          tripId: pendingTripId ?? trip?.id ?? null,
          text: msgToSend
        });
        console.log('[AssistantChatScreen] Auto-send completed successfully');
      } catch (e) {
        console.error('[AssistantChatScreen] Auto-send failed', e);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [loading, sending, uid, trip?.id, sendMessage, messages.length]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    }
  }, [messages.length, sending]);

  const flightCard = useMemo(() => {
    if (!trip) return null;
    return {
      title: `${trip.flightNumber ?? 'Flight'} · ${trip.airline ?? 'Airline'}`,
      route: `${trip.from} → ${trip.to}`,
      gate: flightData?.gate ?? '—',
      terminal: flightData?.terminal ?? '—',
      status: trip.monitoringStatus === 'at_risk' ? 'At risk' : trip.monitoringStatus === 'unknown' ? 'Unknown' : 'On Track',
      departure: new Date(trip.departureTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };
  }, [trip, flightData]);

  async function send() {
    const text = input.trim();
    if (!text || !uid || sending) return;
    setInput('');
    console.log('[AssistantChatScreen] Manual send', { preview: text.substring(0, 50) + '...' });
    await sendMessage({ uid, tripId: trip?.id ?? null, text });
  }

  const hasMessages = messages.length > 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a0b1e', paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── Header ── */}
      <View className='bg-tics-amber/25 border border-tics-amber/10 rounded-full p-2' style={{ flexDirection: 'row', alignItems: 'center', gap: 12, }}>
        <View
          style={{
            height: 46, width: 46,
            alignItems: 'center', justifyContent: 'center'
          }}
          className='bg-tics-amber/35 border border-tics-amber/20 rounded-full'>
          <MaterialCommunityIcons name="google-assistant" size={22} color="#fff" />
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
        contentContainerStyle={{ gap: 14, paddingHorizontal: 8, paddingTop: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Welcome bubble */}
        <View style={{ alignItems: 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '90%' }}>
            <View className='rounded-full' style={{ width: 35, height: 35, backgroundColor: 'rgba(59,130,246,0.3)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="google-assistant" size={17} color="#60A5FA" />
            </View>
            <View style={{ flex: 1, borderRadius: 18, backgroundColor: 'rgba(59,130,246,0.30)', borderTopLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(59,130,246,0.1)', padding: 14 }}>
              <Text style={{ fontFamily: 'Syne_500Medium', color: '#f8fafc', fontSize: 14, lineHeight: 21 }}>
                Hi {firstName}! I have live access to your trip data — gates, delays, weather, and more. What do you need?
              </Text>
            </View>
          </View>
        </View>

        {/* Live context card (shown before first message) */}
        {flightCard && !hasMessages && !autoSendAttemptedRef.current && (
          <View className='rounded-4xl' style={{ borderWidth: 1, borderColor: 'rgba(245,158,11,0.06)', backgroundColor: 'rgba(245,158,11,0.1)', padding: 16 }}>
            <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#FBBF24', fontSize: 10, letterSpacing: 0.8, marginBottom: 10 }}>
              LIVE TRIP CONTEXT
            </Text>
            <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 14 }}>{flightCard.title}</Text>
            <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12, marginTop: 2 }}>{flightCard.route}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {[
                { label: 'Gate', value: flightCard.gate, color: '#60A5FA' },
                { label: 'Terminal', value: flightCard.terminal, color: '#A78BFA' },
                { label: 'Status', value: flightCard.status, color: flightCard.status === 'On Track' ? '#22C55E' : '#F59E0B' },
              ].map((item) => (
                <View key={item.label} className='rounded-full' style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 10 }}>{item.label}</Text>
                  <Text style={{ fontFamily: 'Syne_700Bold', color: item.color, fontSize: 13, marginTop: 3 }}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Suggested prompts */}
        {!hasMessages && !autoSendAttemptedRef.current && (
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
          const isError = m.text.startsWith('⚠️');
          return (
            <View key={m.id} style={{ alignItems: isUser ? 'flex-end' : 'flex-start' }}>
              <View style={{ flexDirection: isUser ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, maxWidth: '88%' }}>
                <View className='rounded-full' style={{ width: 35, height: 35, backgroundColor: isUser ? 'rgba(150,199,179, 0.3)' : 'rgba(59,130,246,0.3)', borderWidth: 1, borderColor: isUser ? 'rgba(150,199,179, 0.1)' : 'rgba(59,130,246,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                  {isUser
                    ? <Feather name="user" size={14} color="#C4B5FD" />
                    : <MaterialCommunityIcons name="google-assistant" size={16} color="#60A5FA" />}
                </View>
                <View style={{
                  flex: 1,
                  borderRadius: 18,
                  borderTopRightRadius: isUser ? 4 : 18,
                  borderTopLeftRadius: isUser ? 18 : 4,
                  backgroundColor: isError ? 'rgba(239,68,68,0.1)' : isUser ? 'rgba(150,199,179, 0.3)' : 'rgba(59,130,246,0.3)',
                  borderWidth: 1,
                  borderColor: isError ? 'rgba(239,68,68,0.25)' : isUser ? 'rgba(150,199,179, 0.1)' : 'rgba(59,130,246,0.1)',
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
        gap: 8,
      }}
        className='flex-row p-2 bg-tics-amber/25 border border-tics-amber/10 mb-2 rounded-full'
      >
        <View
          className='border border-[#96C7B3]/30 bg-white/[0.06] rounded-full'
          style={{ flex: 1, paddingHorizontal: 8, minHeight: 46, justifyContent: 'center' }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={sending ? 'Thinking…' : 'Ask anything about your trip…'}
            placeholderTextColor="rgba(248,250,252,0.3)"
            style={{ fontFamily: 'Syne_500Medium', color: '#f8fafc', fontSize: 14, maxHeight: 46 }}
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
            width: 46, height: 46,
            alignItems: 'center', justifyContent: 'center',
          }}
          className='bg-tics-amber/35 border border-tics-amber/20 rounded-full'
        >
          <Ionicons name="send" size={18} color={'#fff'} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}