import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "TICS",
  slug: "TICS",
  version: "1.0.0",

  android: {
    package: "com.kavumadennis.tics",
    googleServicesFile: "./google-services.json",
  },

  plugins: [
    "expo-router",
    "expo-notifications",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    "expo-font",
    [
      "expo-build-properties",
      {
        android: {
          usesCleartextTraffic: true,
          compilerArgs: [
            "-D_LIBCPP_ENABLE_CXX17_REMOVED_FEATURES",
          ],
          extraProguardRules: "-keep class expo.modules.image.** { *; }\n-keep class com.facebook.fresco.** { *; }\n-dontwarn expo.modules.image.**\n-keep class com.facebook.imagepipeline.** { *; }\n-keep class com.facebook.drawee.** { *; }\n-keep class com.facebook.common.** { *; }",
        },
      },
    ],
    "@react-native-google-signin/google-signin",
  ],

  extra: {
    router: {},
    eas: {
      projectId: "a1d93211-154a-47bc-ad0f-0c31d7ac0b60"
    },
  },
});
