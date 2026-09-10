/**
 * RideCompleteScreen.tsx
 * Success screen shown after a last-mile ride is completed.
 */
import { Pressable, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenBackground from '@/src/components/ScreenBackground';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function RideCompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  return (
    <ScreenBackground variant="slate">
      <View style={{ flex: 1, paddingTop: insets.top + 40, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' }}>
        {/* Success icon */}
        <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Ionicons name="checkmark-circle" size={56} color="#22C55E" />
        </View>

        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 24, textAlign: 'center' }}>
          Ride Complete!
        </SafeText>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 12, lineHeight: 22 }}>
          Your last-mile ride has been completed successfully.{'\n'}Thank you for using TICS.
        </SafeText>

        {/* Trip details summary */}
        <LinearGradient
          colors={['rgba(34,197,94,0.08)', 'rgba(34,197,94,0.02)']}
          style={{ width: '100%', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)', padding: 20, marginTop: 32, alignItems: 'center' }}
        >
          <Ionicons name="car" size={24} color="#22C55E" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 14, marginTop: 8 }}>
            Last Mile Completed
          </SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
            Your driver has dropped you off at your destination.
          </SafeText>
        </LinearGradient>

        {/* Action buttons */}
        <View style={{ width: '100%', marginTop: 40, gap: 12 }}>
          <Pressable
            onPress={() => router.replace({ pathname: `/trips/${tripId}` } as any)}
            style={{ borderRadius: 24, backgroundColor: '#22C55E', padding: 18, alignItems: 'center' }}
          >
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 15 }}>
              View Trip Details
            </SafeText>
          </Pressable>

          <Pressable
            onPress={() => router.replace('/home')}
            style={{ borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 18, alignItems: 'center' }}
          >
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 15 }}>
              Back to Home
            </SafeText>
          </Pressable>
        </View>
      </View>
    </ScreenBackground>
  );
}
