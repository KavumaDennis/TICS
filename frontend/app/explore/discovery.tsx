/**
 * AI Discovery screen route
 * Matches expo-router file-based route: /explore/discovery
 */

import { View } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { darkNavTheme } from '@/src/constants/theme';
import AIDiscoveryScreen from '@/src/modules/explore/screens/AIDiscoveryScreen';

export default function ExploreDiscoveryRoute() {
  const params = useLocalSearchParams();
  const lat = typeof params.lat === 'string' ? parseFloat(params.lat) : undefined;
  const lng = typeof params.lng === 'string' ? parseFloat(params.lng) : undefined;
  const userLocation = (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng))
    ? { lat, lng }
    : undefined;

  return (
    <ThemeProvider value={darkNavTheme}>
      <View style={{ flex: 1, backgroundColor: '#0a0b1e' }}>
        <AIDiscoveryScreen userLocation={userLocation} />
      </View>
    </ThemeProvider>
  );
}
