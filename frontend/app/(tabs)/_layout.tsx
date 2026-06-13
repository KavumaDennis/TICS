import { Tabs } from 'expo-router';
import { Ionicons, Fontisto, Feather, MaterialCommunityIcons  } from '@expo/vector-icons';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';


import { useAuthStore } from '@/src/store/useAuthStore';
import { useAlertStore } from '@/src/store/alertStore';
import PersistentTabBar from '@/src/components/PersistentTabBar';

export default function TabsLayout() {
  const token = useAuthStore((s) => s.token);
  const unreadAlerts = useAlertStore((s) => s.userAlerts.filter((a) => a.active && !a.read).length);

  return (
    <Tabs
      tabBar={() => <PersistentTabBar />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Feather style={{ marginTop: -8 }} name={focused ? 'home' : 'home'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
          href: token ? undefined : '/auth/login',
          tabBarIcon: ({ color, size, focused }) => (
            <Fontisto style={{ marginTop: -8 }} name={focused ? 'plane' : 'plane'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'Assistant',
          tabBarIcon: ({ focused, color }) => (

            <MaterialCommunityIcons  style={{ marginTop: -8 }} name="google-assistant" size={24} color={color} />

          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarBadge: unreadAlerts ? unreadAlerts : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons style={{ marginTop: -8 }} name={focused ? 'notifications' : 'notifications-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          href: token ? undefined : '/auth/login',
          tabBarIcon: ({ color, size, focused }) => (
            <Feather style={{ marginTop: -8 }} name={focused ? 'user' : 'user'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
