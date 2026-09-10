/**
 * AIHubBottomSheet
 * ─────────────────────────────────────────────────────────────────────────────
 * Lazy-loaded bottom sheet for the AI Hub.
 * Uses shared aiHubStore for visibility so AIHubTab and this sheet stay in sync.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { SafeText } from '@/src/components/responsive/SafeText';
import { useAIHub } from '@/src/hooks/useAIHub';
import { useAIHubStore } from '@/src/store/aiHubStore';

/* ── Constants ─────────────────────────────────────────────────────────────── */

const SPRING_CONFIG = { damping: 15, stiffness: 150, mass: 0.5 };

/* ── Sub-Components ────────────────────────────────────────────────────────── */

function ActionCard({
  icon,
  title,
  description,
  buttonText,
  onPress,
  accent = 'blue',
}: {
  icon: string;
  title: string;
  description: string;
  buttonText: string;
  onPress: () => void;
  accent?: 'blue' | 'purple';
}) {
  const accentColor = accent === 'purple' ? '#8B5CF6' : '#3B82F6';
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 rounded-3xl border border-tics-amber/10 bg-tics-amber/20 p-5 active:opacity-80"
    >
      <View className="flex-row items-center gap-3 mb-3">
        <View
          className="w-12 h-12 rounded-2xl items-center justify-center"
          style={{ backgroundColor: `${accentColor}30` }}
        >
          <Text style={{ fontSize: 26 }}>{icon}</Text>
        </View>
      </View>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 16, marginBottom: 6 }}>
        {title}
      </SafeText>
      <SafeText
        style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11, lineHeight: 18, marginBottom: 12 }}
      >
        {description}
      </SafeText>
      <View
        className="rounded-full py-4 items-center"
        style={{ backgroundColor: `${accentColor}40`, borderWidth: 1, borderColor: `${accentColor}80` }}
      >
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 12 }}>
          {buttonText}
        </SafeText>
      </View>
    </Pressable>
  );
}

function InsightChip({ text }: { text: string }) {
  return (
    <View className="flex-row items-start gap-2 bg-white/[0.04] rounded-full p-3 border border-tics-amber/50">
      <Text className='text-tics-muted' style={{ fontSize: 14, lineHeight: 20, fontFamily: 'ShareTech_400Regular', }}>{text}</Text>
    </View>
  );
}

function SuggestionPill({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full bg-tics-amber/15 border border-tics-amber/20 px-4 py-2 active:opacity-70"
    >
      <SafeText className='text-tics-muted' style={{ fontFamily: 'ShareTech_400Regular', fontSize: 11 }}>
        {text}
      </SafeText>
    </Pressable>
  );
}

function ConversationPreview({ text, onContinue }: { text: string; onContinue: () => void }) {
  if (!text) return null;
  return (
    <Pressable onPress={onContinue} className="bg-white/[0.04] rounded-2xl p-4 border border-white/[0.06] active:opacity-80">
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>
        Last AI conversation
      </SafeText>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#e2e8f0', fontSize: 13, lineHeight: 20 }}>
        &ldquo;{text}&rdquo;
      </SafeText>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#3B82F6', fontSize: 11, marginTop: 8 }}>
        Continue →
      </SafeText>
    </Pressable>
  );
}

function DiscoveryPreview({ item, onExplore }: { item: any; onExplore: () => void }) {
  if (!item) return null;
  const name = item.name || item.title || 'Unknown destination';
  const description = item.description || 'Perfect for your next adventure.';
  return (
    <Pressable onPress={onExplore} className="bg-white/[0.04] rounded-2xl p-4 border border-white/[0.06] active:opacity-80">
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>
        AI Discovery
      </SafeText>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 15, marginBottom: 4 }}>
        You may like:
      </SafeText>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fbbf24', fontSize: 16, marginBottom: 4 }}>
        {name}
      </SafeText>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, lineHeight: 18, marginBottom: 8 }}>
        {description.slice(0, 100)}
      </SafeText>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#3B82F6', fontSize: 11 }}>
        Explore →
      </SafeText>
    </Pressable>
  );
}

function ActivityChip({ label, time }: { label: string; time: string }) {
  return (
    <View className="flex-row items-center gap-2 bg-white/[0.04] rounded-full px-3 py-1.5 border border-white/[0.06]">
      <View className="w-1.5 h-1.5 rounded-full bg-tics-amber" />
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#cbd5e1', fontSize: 10 }}>
        {label}
      </SafeText>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 10 }}>
        {time}
      </SafeText>
    </View>
  );
}

/* ── Main Sheet Component ──────────────────────────────────────────────────── */

export default function AIHubBottomSheet() {
  const insets = useSafeAreaInsets();
  const open = useAIHubStore((s) => s.open);
  const setOpen = useAIHubStore((s) => s.setOpen);
  const { data, actions, loading, refresh } = useAIHub();

  // Animated height — starts hidden
  const translateY = useSharedValue(800);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (open) {
      translateY.value = withSpring(0, SPRING_CONFIG);
      backdropOpacity.value = withTiming(1, { duration: 200 });
      // Refresh data when opening
      refresh();
    } else {
      translateY.value = withSpring(800, { ...SPRING_CONFIG, mass: 0.6 });
      backdropOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [open]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  return (
    <View
      style={{
        display: open ? 'flex' : 'none',
        position: 'absolute',
        inset: 0,
        zIndex: 9999,
        justifyContent: 'flex-end',
      }}
      pointerEvents="box-none"
    >
      {/* Backdrop */}
      <Animated.View
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
          backdropStyle,
        ]}
      >
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          sheetStyle,
          {
            maxHeight: '60%',
            overflow: 'hidden',
             borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          },
        ]}
        className="bg-gray-900 border-t border-r border-l border-tics-amber/10"
      >
        {/* Drag Handle */}
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-white/30" />
        </View>

        {/* Content */}
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: Math.max(insets.bottom + 20, 24),
            gap: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between">
            <View>
              <SafeText className='text-tics-amber' style={{ fontFamily: 'ShareTech_400Regular', fontSize: 22 }}>
                TICS AI
              </SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12 }}>
                Choose how you'd like AI to help
              </SafeText>
            </View>
            <Pressable onPress={handleClose} className="w-10 h-10 items-center justify-center rounded-full bg-white/[0.06]">
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>

          {/* Action Cards */}
          <View className="flex-row gap-3">
            <ActionCard
              icon="🤖"
              title="AI Travel Assistant"
              description="Ask questions, plan trips, modify itineraries, packing lists, travel advice, visa info, budget planning, and live assistance."
              buttonText="Open Assistant"
              onPress={actions.openAssistant}
              accent="blue"
            />
            <ActionCard
              icon="🧭"
              title="AI Discovery"
              description="Discover destinations, hidden gems, events, weekend escapes, restaurants, activities, and personalized recommendations."
              buttonText="Start Discovering"
              onPress={actions.startDiscovering}
              accent="purple"
            />
          </View>

          {/* Quick AI Insights */}
          {data.insights.length > 0 && (
            <View>
              <SafeText className='text-tics-amber' style={{ fontFamily: 'ShareTech_400Regular', fontSize: 13, marginBottom: 10 }}>
                Today's Insights
              </SafeText>
              <View className="gap-2">
                {data.insights.map((insight, i) => (
                  <InsightChip key={i} text={insight} />
                ))}
              </View>
            </View>
          )}

          {/* Suggested Actions */}
          {data.suggestions.length > 0 && (
            <View>
              <SafeText className='text-tics-amber' style={{ fontFamily: 'ShareTech_400Regular', fontSize: 13, marginBottom: 10 }}>
                Suggested Actions
              </SafeText>
              <View className="flex-row flex-wrap gap-2">
                {data.suggestions.map((suggestion, i) => (
                  <SuggestionPill
                    key={i}
                    text={suggestion}
                    onPress={() => actions.onSuggestionTap(suggestion)}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Conversation Preview */}
          {data.lastConversation && (
            <View>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
                Conversation Preview
              </SafeText>
              <ConversationPreview text={data.lastConversation.text} onContinue={actions.openAssistant} />
            </View>
          )}

          {/* Discovery Preview */}
          {data.discoveryItem && (
            <DiscoveryPreview item={data.discoveryItem} onExplore={actions.startDiscovering} />
          )}

          {/* Recent Activity */}
          {data.recentActivities.length > 0 && (
            <View>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, marginBottom: 10 }}>
                Recent Activity
              </SafeText>
              <View className="flex-row flex-wrap gap-2">
                {data.recentActivities.map((activity, i) => (
                  <ActivityChip key={i} label={activity.label} time={activity.time} />
                ))}
              </View>
            </View>
          )}

          {loading && (
            <View className="items-center py-4">
              <ActivityIndicator size="small" color="#3B82F6" />
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}