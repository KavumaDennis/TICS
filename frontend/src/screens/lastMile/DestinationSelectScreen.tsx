/**
 * DestinationSelectScreen.tsx
 * Choose destination via Google Places Autocomplete or manual entry.
 * Searches globally (not restricted to a single country).
 */
import { useState, useRef } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenBackground from '@/src/components/ScreenBackground';
import { saveDestinationAndStartRide } from '@/src/services/RideStatusService';
import { useAuthStore } from '@/src/store/useAuthStore';
import { createRideRequest } from '@/src/services/RideRequestService';
import { SafeText } from '@/src/components/responsive/SafeText';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

interface PlaceResult {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export default function DestinationSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { assignmentId, tripId, operatorId, operatorName } = useLocalSearchParams<{ 
    assignmentId: string; 
    tripId?: string;
    operatorId?: string;
    operatorName?: string;
  }>();
  const uid = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [manualAddr, setManualAddr] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = async (input: string) => {
    if (!input || input.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    if (!API_KEY) {
      setError('Google Maps API key is not configured');
      setSearching(false);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      // Search globally — no country restriction so it works for any destination
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${API_KEY}&types=geocode|establishment`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && data.predictions) {
        setSuggestions(data.predictions);
        if (data.predictions.length === 0) {
          setError('No results found. Try a different search or enter manually.');
        }
      } else if (data.status === 'ZERO_RESULTS') {
        setSuggestions([]);
        setError('No results found. Try a different search or enter manually.');
      } else {
        setSuggestions([]);
        if (data.status === 'REQUEST_DENIED') {
          setError('Google Places API is not enabled. Please check your API key.');
        } else if (data.status === 'INVALID_REQUEST') {
          setError('Invalid search. Please try again.');
        }
      }
    } catch {
      setSuggestions([]);
      setError('Network error. Check your connection and try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (text.length < 2) {
      setSuggestions([]);
      setError(null);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(text), 400);
  };

  const resolvePlace = async (placeId: string, description: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${API_KEY}&fields=geometry,name,formatted_address`;
      const res = await fetch(url);
      const data = await res.json();
      const loc = data.result?.geometry?.location;
      if (!loc) {
        throw new Error('Could not find location coordinates');
      }
      const name = data.result?.formatted_address || description;
      
      if (assignmentId) {
        // If we have an assignment, save the destination and navigate to tracking
        await saveDestinationAndStartRide(assignmentId, {
          name,
          latitude: loc.lat,
          longitude: loc.lng,
        });
        router.replace({
          pathname: '/last-mile/tracking' as any,
          params: { assignmentId, step: 'tracking' },
        } as any);
      } else if (uid && operatorId && tripId) {
        // Create a ride request so the operator can assign a driver
        setError(null);
        const requestId = await createRideRequest(
          uid,
          operatorId,
          tripId,
          'Airport arrival',
          undefined,
          undefined,
          name,
          loc.lat,
          loc.lng,
          '',
          user?.name || user?.email || undefined,
        );
        
        // Navigate back to coordination screen - it will show the pending request status
        // and listen for the assignment
        router.replace({
          pathname: `/last-mile/${tripId}` as any,
        } as any);
      } else {
        // Fallback: navigate to coordination screen
        router.back();
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save destination. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualAddr.trim() || !assignmentId) return;
    setLoading(true);
    setError(null);
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(manualAddr)}&key=${API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      const loc = data.results?.[0]?.geometry?.location;
      const formatted = data.results?.[0]?.formatted_address || manualAddr;
      if (!loc) {
        throw new Error('Could not find that address. Please be more specific.');
      }
      await saveDestinationAndStartRide(assignmentId, {
        name: formatted,
        latitude: loc.lat,
        longitude: loc.lng,
      });
      router.replace({
        pathname: '/last-mile/tracking' as any,
        params: { assignmentId, step: 'tracking' },
      } as any);
    } catch (e: any) {
      Alert.alert('Geocoding Error', e?.message || 'Could not find that address.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground variant="slate">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, paddingTop: insets.top + 2, paddingHorizontal: 8 }}
      >
        {/* Header */}
        <View className='bg-tics-amber/35 border border-tics-amber/20 p-2 rounded-full' style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ width: 46, height: 46 }}
            className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20"
          >
            <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
          </Pressable>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 18 }}>
            Choose Destination
          </SafeText>
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          {/* Search input */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderColor: 'rgba(255,255,255,0.1)',
              backgroundColor: 'rgba(255,255,255,0.06)',
            }}
            className="rounded-full border px-4 py-3"
          >
            <Ionicons name="search" size={18} color="#64748b" style={{ marginRight: 10 }} />
            <TextInput
              value={query}
              onChangeText={handleQueryChange}
              placeholder="Search for a place or address..."
              placeholderTextColor="#64748b"
              style={{
                flex: 1,
                fontFamily: 'ShareTech_400Regular',
                color: '#f8fafc',
                fontSize: 14,
                // height: 52,
              }}
              // className="py-3"
              autoFocus
            />
            {searching && <ActivityIndicator size="small" color="#8B5CF6" />}
          </View>

          {/* Error message */}
          {error && suggestions.length === 0 && !searching && (
            <View
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                backgroundColor: 'rgba(245,158,11,0.1)',
                borderWidth: 1,
                borderColor: 'rgba(245,158,11,0.2)',
              }}
            >
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F59E0B', fontSize: 12, textAlign: 'center' }}>
                {error}
              </SafeText>
            </View>
          )}

          {/* Suggestions list */}
          {suggestions.length > 0 && (
            <View
              style={{
                marginTop: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
                backgroundColor: 'rgba(255,255,255,0.04)',
                overflow: 'hidden',
              }}
            >
              {suggestions.map((s) => (
                <Pressable
                  key={s.place_id}
                  onPress={() => resolvePlace(s.place_id, s.description)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255,255,255,0.05)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Ionicons name="location-outline" size={18} color="#8B5CF6" />
                  <View style={{ flex: 1 }}>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 14 }}>
                      {s.structured_formatting.main_text}
                    </SafeText>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                      {s.structured_formatting.secondary_text}
                    </SafeText>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
                </Pressable>
              ))}
            </View>
          )}

          {/* Manual entry toggle */}
          <Pressable
            onPress={() => setShowManual(!showManual)}
            style={{ marginTop: 16, alignItems: 'center', padding: 12 }}
          >
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#8B5CF6', fontSize: 13 }}>
              {showManual ? 'Hide manual entry' : 'Enter address manually'}
            </SafeText>
          </Pressable>

          {/* Manual address input */}
          {showManual && (
            <View style={{ marginTop: 12 }}>
              <TextInput
                value={manualAddr}
                onChangeText={setManualAddr}
                placeholder="Type full address..."
                placeholderTextColor="#64748b"
                multiline
                style={{
                  fontFamily: 'ShareTech_400Regular',
                  color: '#f8fafc',
                  fontSize: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.1)',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  padding: 14,
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
              />
              <Pressable
                onPress={handleManualSubmit}
                disabled={loading || !manualAddr.trim()}
                style={{
                  marginTop: 12,
                  borderRadius: 16,
                  backgroundColor: manualAddr.trim() ? '#8B5CF6' : 'rgba(139,92,246,0.3)',
                  padding: 16,
                  alignItems: 'center',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 14 }}>
                    Set Destination
                  </SafeText>
                )}
              </Pressable>
            </View>
          )}

          {/* Loading overlay when resolving place */}
          {loading && (
            <View
              style={{
                marginTop: 20,
                alignItems: 'center',
                gap: 8,
              }}
            >
              <ActivityIndicator size="small" color="#8B5CF6" />
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12 }}>
                Saving destination...
              </SafeText>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}
