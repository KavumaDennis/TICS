import { Ionicons, Fontisto, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAlertStore } from '@/src/store/alertStore';

type Tab = { key: 'home' | 'trips' | 'assistant' | 'alerts' | 'profile'; label: string; href: string };

export default function PersistentTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const unreadAlerts = useAlertStore((s) => s.userAlerts.filter((a) => a.active && !a.read).length);

  const tabs: Tab[] = [
    { key: 'home', label: 'Home', href: '/home' },
    { key: 'trips', label: 'Trips', href: '/(tabs)/trips' },
    { key: 'assistant', label: 'Assistant', href: '/assistant' },
    { key: 'alerts', label: 'Alerts', href: '/(tabs)/alerts' },
    { key: 'profile', label: 'Profile', href: '/profile' },
  ];

  function isActive(tab: Tab) {
    if (tab.href === '/home') return pathname === '/home' || pathname === '/dashboard';
    if (tab.href === '/(tabs)/trips') return pathname === '/trips' || pathname.startsWith('/trips/');
    if (tab.href === '/(tabs)/alerts') return pathname === '/alerts' || pathname.startsWith('/alerts/');
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  }

  const icon = (key: Tab['key'], focused: boolean, color: string) => {
    switch (key) {
      case 'home':
        return <Feather name="home" size={22} color={color} style={{ marginTop: -2 }} />;
      case 'trips':
        return <Fontisto name="plane" size={20} color={color} style={{ marginTop: -2 }} />;
      case 'assistant':
        return <MaterialCommunityIcons name="google-assistant" size={24} color={color} style={{ marginTop: -2 }} />;
      case 'alerts':
        return <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={22} color={color} style={{ marginTop: -2 }} />;
      case 'profile':
        return <Feather name="user" size={22} color={color} style={{ marginTop: -2 }} />;
    }
  };

  return (
    <View
      style={{
        paddingBottom: Math.max(10, insets.bottom),
        paddingTop: 10,
      }}
      className="px-4 mt-auto flex-row items-center justify-between border-t border-[#96C7B3]/25  bg-[#0a0b1e]"
    >
      {tabs.map((t) => {
        const focused = isActive(t);
        const color = focused ? '#8B5CF6' : 'rgba(248,250,252,0.55)';
        return (
          <Pressable key={t.key} onPress={() => router.navigate(t.href as any)} className="items-center justify-center px-3 py-1 active:opacity-90">
            <View>
              {icon(t.key, focused, color)}
              {t.key === 'alerts' && unreadAlerts > 0 ? <View className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-tics-red" /> : null}
            </View>
            <Text style={{ fontFamily: 'Syne_700Bold', color }} className="mt-1 text-[10px]">
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
