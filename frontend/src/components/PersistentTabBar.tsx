import { Ionicons, Fontisto, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAlertStore } from '@/src/store/alertStore';

type Tab = { key: 'home' | 'trips' | 'explore' | 'alerts' | 'profile'; label: string; href: string };

export default function PersistentTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const unreadAlerts = useAlertStore((s) => s.userAlerts.filter((a) => a.active && !a.read).length);

  const tabs: Tab[] = [
    { key: 'home', label: 'Home', href: '/home' },
    { key: 'trips', label: 'Trips', href: '/(tabs)/trips' },
    { key: 'explore', label: 'Explore', href: '/explore' },
    { key: 'alerts', label: 'Alerts', href: '/(tabs)/alerts' },
    { key: 'profile', label: 'Profile', href: '/profile' },
  ];

  function isActive(tab: Tab) {
    if (tab.href === '/home') return pathname === '/home' || pathname === '/dashboard';
    if (tab.href === '/(tabs)/trips') return pathname === '/trips' || pathname.startsWith('/trips/');
    if (tab.href === '/explore') return pathname === '/explore' || pathname.startsWith('/explore/');
    if (tab.href === '/(tabs)/alerts') return pathname === '/alerts' || pathname.startsWith('/alerts/');
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  }

  const icon = (key: Tab['key'], focused: boolean, color: string) => {
    switch (key) {
      case 'home':
        return <Feather name="home" size={22} color={color} style={{ marginTop: -2 }} />;
      case 'trips':
        return <Fontisto name="plane" size={20} color={color} style={{ marginTop: -2 }} />;
      case 'explore':
        return <Ionicons name={focused ? 'compass' : 'compass-outline'} size={24} color={color} style={{ marginTop: -2 }} />;
      case 'alerts':
        return <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={22} color={color} style={{ marginTop: -2 }} />;
      case 'profile':
        return <Feather name="user" size={22} color={color} style={{ marginTop: -2 }} />;
    }
  };

  return (
    <View 
      className="p-2 mt-auto flex-row items-center justify-between rounded-full bg-tics-amber/20 border-tics-amber/15"
      
    >
      {tabs.map((t) => {
        const focused = isActive(t);
        const color = focused ? '#fff' : 'rgba(248,250,252,0.55)';
        return (
          <Pressable key={t.key} onPress={() => router.navigate(t.href as any)} className={`${focused ? "bg-tics-amber/35" : ""} border border-tics-amber/20 shadow-lg items-center justify-center rounded-full p-5 active:opacity-90`}>
            <View>
              {icon(t.key, focused, color)}
              {t.key === 'alerts' && unreadAlerts > 0 ? <View className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-tics-red" /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
