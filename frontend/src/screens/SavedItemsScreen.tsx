/**
 * SavedItemsScreen — shows all items the user has saved for later.
 * Loaded from users/{uid}/saved collection via Firestore listener.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSaveStore, type SavedItem } from '@/src/store/saveStore';

const TYPE_META: Record<SavedItem['itemType'], { icon: string; color: string; label: string }> = {
  alert:          { icon: 'warning-outline',   color: '#EF4444', label: 'Alert'          },
  recommendation: { icon: 'bulb-outline',       color: '#22C55E', label: 'Recommendation' },
  insight:        { icon: 'sparkles-outline',   color: '#3B82F6', label: 'Insight'        },
};

type Filter = 'all' | SavedItem['itemType'];

export default function SavedItemsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items } = useSaveStore();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((i) => i.itemType === filter);
  }, [items, filter]);

  function Chip({ id, label }: { id: Filter; label: string }) {
    const active = filter === id;
    return (
      <Pressable onPress={() => setFilter(id)}>
        <View style={{ borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: active ? '#22C55E' : 'rgba(255,255,255,0.1)', backgroundColor: active ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)' }}>
          <Text style={{ fontFamily: 'Syne_500Medium', fontSize: 12, color: active ? '#fff' : 'rgba(148,163,184,0.8)' }}>
            {label}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
      {/* Header */}
      <View className="flex-row items-center gap-3 px-2 pb-4">
        <Pressable onPress={() => router.back()} className="h-11 w-11 items-center justify-center rounded-xl border border-[#96C7B3]/50 bg-white/[0.05]">
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View className="flex-1">
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[17px]">Saved Items</Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[12px]">
            {items.length} item{items.length !== 1 ? 's' : ''} saved
          </Text>
        </View>
      </View>

      {/* Filters */}
      <View className="flex-row gap-2 px-2 pb-4">
        <Chip id="all" label={`All (${items.length})`} />
        <Chip id="recommendation" label="Recommendations" />
        <Chip id="alert" label="Alerts" />
        <Chip id="insight" label="Insights" />
      </View>

      <ScrollView
        contentContainerStyle={{ gap: 12, paddingHorizontal: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {filtered.map((item) => {
          const meta = TYPE_META[item.itemType] ?? TYPE_META.insight;
          const title = (item.data?.title as string) ?? item.itemId;
          const message = (item.data?.message as string) ?? '';
          const savedTime = item.savedAt?.toDate
            ? new Date(item.savedAt.toDate()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            : 'Saved';

          return (
            <View
              key={item.savedId}
              style={{ borderRadius: 16, backgroundColor: `${meta.color}30`, padding: 16 }}
            >
              <View className="flex-row items-start gap-3">
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${meta.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View className="flex-row items-center justify-between mb-1">
                    <Text style={{ fontFamily: 'Syne_500Medium', color: meta.color, fontSize: 10, letterSpacing: 0.8 }}>
                      {meta.label.toUpperCase()}
                    </Text>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: 'rgba(148,163,184,0.5)', fontSize: 10 }}>
                      {savedTime}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 14, lineHeight: 20 }}>
                    {title}
                  </Text>
                  {message ? (
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12, lineHeight: 18, marginTop: 4 }} numberOfLines={2}>
                      {message}
                    </Text>
                  ) : null}
                  {item.tags?.length > 0 && (
                    <View className="flex-row flex-wrap gap-1 mt-3">
                      {item.tags.map((tag: string) => (
                        <View key={tag} style={{ borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 10 }}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        })}

        {!filtered.length && (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Ionicons name="bookmark-outline" size={48} color="rgba(248,250,252,0.1)" />
            <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 16, marginTop: 16 }}>
              Nothing saved yet
            </Text>
            <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 }}>
              Tap the bookmark icon on any alert or recommendation to save it here.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
