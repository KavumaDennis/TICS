import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

import { usePushTokenStore } from '@/src/store/pushTokenStore';
import { useAuthStore } from '@/src/store/useAuthStore';

/**
 * Expo Go + simulators/emulators do NOT support push tokens properly.
 * We only allow real physical devices.
 */
function isPushSupported() {
  return Device.isDevice;
}

// prevent multiple handler registrations across hot reloads
let handlerRegistered = false;

export function usePushNotifications() {
  const setToken = usePushTokenStore((s) => s.setToken);
  const setDevicePushToken = useAuthStore((s) => s.setDevicePushToken);

  useEffect(() => {
    let cancelled = false;

    async function register() {
      if (Platform.OS === 'web') return;
      if (!isPushSupported()) return;

      let Notifications: typeof import('expo-notifications');

      try {
        Notifications = await import('expo-notifications');
      } catch {
        return;
      }

      // register notification handler once
      if (!handlerRegistered) {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });

        handlerRegistered = true;
      }

      try {
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();

        let status = existingStatus;

        if (existingStatus !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          status = req.status;
        }

        if (status !== 'granted') return;

        // Android notification channel setup
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const token = (await Notifications.getDevicePushTokenAsync()).data;

        if (cancelled) return;

        setToken(token);

        try {
          await setDevicePushToken(token);
        } catch (e) {
          console.warn('Failed to sync push token to backend:', e);
        }
      } catch (e) {
        console.warn('Push notification registration failed:', e);
      }
    }

    register();

    return () => {
      cancelled = true;
    };
  }, [setDevicePushToken, setToken]);
}