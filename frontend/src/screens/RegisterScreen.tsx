import { useState } from 'react';
import { Pressable, Text, TextInput, View, Platform } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Fontisto from '@expo/vector-icons/Fontisto';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleAuthProvider, OAuthProvider } from 'firebase/auth';

import Card from '@/src/components/Card';
import { useAuthStore } from '@/src/store/useAuthStore';
import { base64Encode } from '@/src/utils/base64';
import ImageSlider from './ImageSlider';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function hasGoogleClientIdForPlatform() {
  if (Platform.OS === 'web') return Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
  if (Platform.OS === 'ios') return Boolean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  if (Platform.OS === 'android') return Boolean(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID);
  return false;
}

function GoogleSignInButton({ onError, onSuccess }: { onError: (m: string) => void; onSuccess: () => void }) {
  const { loginWithFirebaseCredential, loading } = useAuthStore();

  const [googleRequest, , promptGoogle] = Google.useAuthRequest({
    responseType: 'id_token',
    scopes: ['profile', 'email', 'openid'],
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  async function handleGoogle() {
    try {
      const res = await promptGoogle({ showInRecents: true });
      if (res.type !== 'success') return;
      const idToken = (res as any)?.params?.id_token;
      if (!idToken) return onError('Google sign-in did not return an ID token.');
      const credential = GoogleAuthProvider.credential(idToken);
      const ok = await loginWithFirebaseCredential(credential, null, null);
      if (ok) onSuccess();
    } catch (e: any) {
      onError(e?.message ?? 'Google sign-in failed.');
    }
  }

  return (
    <Pressable
      disabled={loading || !googleRequest}
      onPress={handleGoogle}
      className={`flex-1 ${loading || !googleRequest ? 'opacity-60' : ''}`}
    >
      <View className="flex-row items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-4 gap-2">
        <Ionicons name="logo-google" size={18} color="#EF4444" />
        <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-[13px] text-tics-text">Google</Text>
      </View>
    </Pressable>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const { token, loading, error, register, loginWithFirebaseCredential } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (token) return <Redirect href="/home" />;

  async function onApple() {
    setLocalError(null);
    try {
      if (Platform.OS !== 'ios') return setLocalError('Apple sign-in is only available on iOS.');
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) return setLocalError('Apple sign-in is not available on this device.');

      const nonce = base64Encode(Crypto.getRandomBytes(16));
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);

      const appleCred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!appleCred.identityToken) return setLocalError('Apple sign-in did not return an identity token.');

      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({ idToken: appleCred.identityToken, rawNonce: nonce } as any);

      const fallbackName =
        appleCred.fullName?.givenName || appleCred.fullName?.familyName
          ? `${appleCred.fullName?.givenName ?? ''} ${appleCred.fullName?.familyName ?? ''}`.trim()
          : null;

      const ok = await loginWithFirebaseCredential(credential, appleCred.email ?? null, fallbackName);
      if (ok) router.replace('/trip/add' as any);
    } catch (e: any) {
      const msg = e?.code === 'ERR_REQUEST_CANCELED' ? null : (e?.message ?? 'Apple sign-in failed.');
      if (msg) setLocalError(msg);
    }
  }

  async function onSubmit() {
    setLocalError(null);
    if (!isValidEmail(email)) return setLocalError('Enter a valid email address.');
    if (password.length < 8) return setLocalError('Password must be at least 8 characters.');
    const ok = await register(email, password, name.trim() ? name.trim() : undefined);
    if (ok) router.replace('/trip/add' as any);
  }

  return (
    <View className="flex-1 px-5 pt-14">
      {/* Header */}
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-xl border border-[#96C7B3]/50 bg-white/[0.06]"
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View className="flex-row items-center gap-3">
          <View className="rounded-xl h-11 w-11 justify-center items-center border border-white/10 bg-tics-blue">
            <Fontisto name="plane" size={17} color="white" />
          </View>
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="uppercase text-tics-text text-xl">TICS</Text>
        </View>
      </View>

      <View className="mt-8">
        <Text style={{ fontFamily: 'Syne_700Bold', fontSize: 24 }} className="text-tics-amber tracking-tight">Create Account</Text>
        <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="mt-1 text-tics-muted text-[13px] leading-5">{"Let's get you started."}</Text>
      </View>

      <Card className="">
        <ImageSlider />

        {/* Form */}
        <View className="mt-5 gap-3">
          <TextInput
            style={{ fontFamily: 'Syne_700Bold' }}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="Full Name"
            placeholderTextColor="rgba(248,250,252,0.32)"
            className="px-4 py-4 rounded-xl border border-[#96C7B3]/50 bg-white/[0.06] text-tics-text"
          />

          <TextInput
            style={{ fontFamily: 'Syne_700Bold' }}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="Email Address"
            placeholderTextColor="rgba(248,250,252,0.32)"
            className="px-4 py-4 rounded-xl border border-[#96C7B3]/50 bg-white/[0.06] text-tics-text"
          />

          <View
            className="p-1 rounded-xl border border-[#96C7B3]/50 bg-white/[0.06]"
          >
            <View className="flex-row items-center">
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                placeholder="••••••••"
                placeholderTextColor="rgba(248,250,252,0.32)"
                className="flex-1 px-4 py-3 text-tics-text"
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                style={{ borderRadius: 8 }}
                className="ml-2 h-10 w-10 items-center justify-center bg-[#96C7B3]/50"
              >
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color="rgba(248,250,252,0.85)" />
              </Pressable>
            </View>
          </View>
        </View>

        {localError || error ? (
          <Text className="mt-2 ml-1 text-[10px] font-semibold p-0.5 rounded-full px-2 self-start bg-tics-red text-tics-bg">
            {localError ?? error}
          </Text>
        ) : null}

        <Pressable
          disabled={loading}
          onPress={onSubmit}
          className={`items-center justify-center py-4 bg-tics-amber rounded-2xl ${loading ? 'mt-5 opacity-60' : 'mt-5'}`}
        >
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-[14px] text-black">
            {loading ? 'Creating…' : 'Create Account'}
          </Text>
        </Pressable>

        {/* Divider */}
        <View className="mt-6 flex-row items-center gap-3">
          <View className="h-px flex-1 bg-white/10" />
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-muted text-[11px]">or continue with</Text>
          <View className="h-px flex-1 bg-white/10" />
        </View>

        {/* Social sign-in */}
        <View className="mt-4 flex-row gap-3">
          {hasGoogleClientIdForPlatform() ? (
            <GoogleSignInButton
              onError={(m) => setLocalError(m)}
              onSuccess={() => router.replace('/trip/add' as any)}
            />
          ) : (
            <Pressable className="flex-1">
              <View className="flex-row items-center justify-center rounded-full border border-[#96C7B3]/50 bg-white/[0.06] px-4 py-4 gap-2">
                <Ionicons name="logo-google" size={18} color="#EF4444" />
                <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-[13px] text-tics-text">Google</Text>
              </View>
            </Pressable>
          )}

          {Platform.OS === 'ios' ? (
            <Pressable className="flex-1" disabled={loading} onPress={onApple}>
              <View className={`flex-row items-center justify-center rounded-full border border-[#96C7B3]/50 bg-white/[0.06] px-4 py-4 gap-2 ${loading ? 'opacity-60' : ''}`}>
                <Ionicons name="logo-apple" size={18} color="#000000" />
                <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-[13px] text-black">Apple</Text>
              </View>
            </Pressable>
          ) : (
            <>
            </>
          )}
        </View>

        <Pressable onPress={() => router.push('/auth/login')} className="mt-6">
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-center text-[12px] text-tics-muted">
            Already have an account?{' '}
            <Text className="text-tics-amber">Login</Text>
          </Text>
        </Pressable>
      </Card>
    </View>
  );
}
