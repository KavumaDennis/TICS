import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchDestinationInsights, type DestinationInsight } from '@/src/services/DestinationInsightsService';
import Feather from '@expo/vector-icons/Feather';
import { SafeText } from '@/src/components/responsive/SafeText';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function DestinationInsights() {
  const [query, setQuery] = useState('');
  const [insight, setInsight] = useState<DestinationInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const insets = useSafeAreaInsets();

  const openModal = () => {
    setVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      damping: 20,
      stiffness: 90,
      useNativeDriver: true,
    }).start();
  };

  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
    });
  };

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setInsight(null);

    try {
      const result = await fetchDestinationInsights(trimmed);
      console.log("Destination result:", result);
      if (result) {
        setInsight(result);
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 20,
          stiffness: 90,
          useNativeDriver: true,
        }).start();
      } else {
        setError('Destination not found. Try a country like "France" or "Japan".');
      }
    } catch {
      setError('Failed to load. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Inline search bar — minimal, won't break layout */}
      <View className="mt-5">
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber ml-1 mb-3">
          Destination Insights
        </SafeText>
        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center rounded-full bg-tics-amber/10 border border-tics-amber/20 px-4 py-2">
            <Ionicons name="search" size={18} color="rgba(148,163,184,0.7)" />
            <TextInput
              className="flex-1 ml-2 text-white text-[14px]"
              placeholder="Search a country..."
              placeholderTextColor="rgba(148,163,184,0.5)"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => { handleSearch(); openModal(); }}
              returnKeyType="search"
              style={{ fontFamily: 'ShareTech_400Regular' }}
            />
            {query.length > 0 && (
              <Pressable onPress={() => { setQuery(''); }}>
                <Ionicons name="close-circle" size={18} color="rgba(148,163,184,0.5)" />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => { handleSearch(); openModal(); }}
            disabled={loading || !query.trim()}
            className="rounded-full bg-tics-amber/35 border border-tics-amber/20 p-4 active:opacity-80"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-white text-[13px]">
                <Feather name="search" size={22} color="rgba(255,255,255,0.7)" />
              </SafeText>
            )}
          </Pressable>
        </View>
      </View>

      {/* Bottom Sheet Modal */}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={closeModal}
      >
        <View className="flex-1 justify-end">
          {/* Backdrop */}
          <TouchableWithoutFeedback onPress={closeModal}>
            <View className="absolute inset-0 bg-black/50" />
          </TouchableWithoutFeedback>

          {/* Sheet */}
          <Animated.View
            style={{
              transform: [{ translateY: slideAnim }],
              maxHeight: SCREEN_HEIGHT * 0.85,
              paddingBottom: insets.bottom + 2,
              borderRadius: 34
            }}
            className="bg-[#0a0c18] rounded-t-4xl overflow-hidden"
          >
            {/* Handle */}
            <View className="items-center pt-3 pb-1">
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(148,163,184,0.3)' }} />
            </View>

            <ScrollView
              className="px-2"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Close button */}
              <View className="flex-row justify-end mb-2">
                <Pressable onPress={closeModal} className="p-2">
                  <Ionicons name="close" size={22} color="rgba(148,163,184,0.7)" />
                </Pressable>
              </View>

              {/* Loading */}
              {loading && (
                <View className="items-center py-12">
                  <ActivityIndicator size="large" color="#60A5FA" />
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[13px] mt-4">Loading destination info...</SafeText>
                </View>
              )}

              {/* Error */}
              {!loading && error && (
                <View className="items-center py-12">
                  <Ionicons name="search-outline" size={48} color="rgba(148,163,184,0.3)" />
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[14px] mt-4 text-center">{error}</SafeText>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[12px] mt-2 text-center">Tip: Try searching by country name</SafeText>
                </View>
              )}

              {/* Results */}
              {!loading && insight && (
                <LinearGradient
                  colors={['rgba(59,130,246,0.12)', 'rgba(139,92,246,0.08)', 'rgba(10,11,30,0.4)']}
                  style={{ borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)', overflow: 'hidden', marginBottom: 12 }}
                  className='rounded-4xl'
                >
                  {/* Flag & Country Header */}
                  <View className="flex-row items-center gap-4 p-4">
                    {insight.flagUrl ? (
                      <View className='rounded-2xl' style={{ width: 64, height: 44, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                        <Image source={{ uri: insight.flagUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      </View>
                    ) : (
                      <View className='rounded-2xl' style={{ width: 64, height: 44, backgroundColor: 'rgba(59,130,246,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="flag" size={24} color="#60A5FA" />
                      </View>
                    )}
                    <View className="flex-1">
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-white text-[17px]">{insight.countryName}</SafeText>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[12px] mt-0.5">
                        {insight.region} · {insight.timezone}
                      </SafeText>
                    </View>
                  </View>

                  {/* Quick Stats */}
                  <View className="flex-row justify-between flex-wrap px-2 pb-3 gap-2">
                    {[
                      { label: 'Capital', value: insight.capital, icon: 'business' as const },
                      { label: 'Population', value: formatPop(insight.population), icon: 'people' as const },
                      { label: 'Currency', value: insight.currency.split(',')[0], icon: 'cash' as const },
                      { label: 'Languages', value: insight.languages.slice(0, 2).join(', '), icon: 'language' as const },
                    ].map((item, i) => (
                      <View key={i} style={{ width: '48%' }} className="rounded-3xl bg-white/5 border border-white/5 p-3">
                        <View className="flex-row items-center gap-1.5 mb-1">
                          <Ionicons name={item.icon} size={12} color="#60A5FA" />
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[10px]">{item.label}</SafeText>
                        </View>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-white text-[13px]" numberOfLines={1}>{item.value}</SafeText>
                      </View>
                    ))}
                  </View>

                  {/* Weather */}
                  {insight.weather && (
                    <View className="mx-2 mb-3 rounded-3xl bg-white/5 border border-white/5 p-3 flex-row items-center gap-3">
                      {insight.weather.icon && (
                        <View style={{ width: 44, height: 44, overflow: 'hidden' }}>
                          <Image source={{ uri: insight.weather.icon }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                        </View>
                      )}
                      <View className="flex-1">
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-white text-[18px]">
                          {insight.weather.tempC}°C
                        </SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[11px] capitalize">
                          {insight.weather.description} · Humidity: {insight.weather.humidity}% · Wind: {insight.weather.windSpeed} m/s
                        </SafeText>
                      </View>
                    </View>
                  )}

                  {/* Top Attractions */}
                  <View className="px-4 pb-3">
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-white text-[14px] mb-3">Top Attractions</SafeText>
                    {insight.topAttractions.map((attraction, i) => (
                      <View key={i} className="flex-row items-center gap-3 mb-2">
                        <LinearGradient
                          colors={['rgba(59,130,246,0.3)', 'rgba(139,92,246,0.2)']}
                          style={{ width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 12 }}>{i + 1}</SafeText>
                        </LinearGradient>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[13px] flex-1">{attraction}</SafeText>
                      </View>
                    ))}
                  </View>

                  {/* Fun Fact */}
                  <View className="mx-4 mb-4 rounded-3xl bg-tics-amber/15 border border-tics-amber/10 p-4">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Ionicons name="bulb" size={16} color="#FBBF24" />
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber text-[11px]">DID YOU KNOW?</SafeText>
                    </View>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[13px] leading-6">{insight.funFact}</SafeText>
                  </View>
                </LinearGradient>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

function formatPop(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}