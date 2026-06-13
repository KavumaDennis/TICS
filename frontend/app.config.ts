import type { ConfigContext, ExpoConfig } from 'expo/config';
import base from './app.json';

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseExpo: any = (base as any)?.expo ?? {};
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || undefined;

  return {
    ...config,
    ...baseExpo,
    ios: {
      ...(baseExpo.ios ?? {}),
      bundleIdentifier: baseExpo.ios?.bundleIdentifier ?? "com.anonymous.frontend",
      config: {
        ...((baseExpo.ios ?? {}).config ?? {}),
        ...(googleMapsApiKey ? { googleMapsApiKey } : {}),
      },
    },
    android: {
      ...(baseExpo.android ?? {}),
      package: baseExpo.android?.package ?? "com.anoymous.frontend",
      config: {
        ...((baseExpo.android ?? {}).config ?? {}),
        ...(googleMapsApiKey
          ? {
            googleMaps: {
              ...(((baseExpo.android ?? {}).config ?? {}).googleMaps ?? {}),
              apiKey: googleMapsApiKey,
            },
          }
          : {}),
      },
    },
  };
};

