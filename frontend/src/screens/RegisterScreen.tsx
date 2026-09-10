import { useState } from 'react';
import { Pressable, Text, TextInput, View, Platform } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Fontisto from '@expo/vector-icons/Fontisto';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import Card from '@/src/components/Card';
import { useAuthStore } from '@/src/store/useAuthStore';
import { base64Encode } from '@/src/utils/base64';
import ImageSlider from './ImageSlider';
import { SafeText } from '@/src/components/responsive/SafeText';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function hasGoogleClientId(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
}

/**
 * Configure GoogleSignin once at module load time.
 * Uses the Web Client ID – this is the correct ID for native Google Sign-In
 * with Firebase when using @react-native-google-signin/google-signin.
 */
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
if (webClientId) {
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
  });
}

function GoogleSignInButton({ onError, onSuccess }: { onError: (m: string) => void; onSuccess: () => void }) {
  const { loginWithFirebaseCredential, loading } = useAuthStore();

  async function handleGoogle() {
    try {
      // Check Google Play Services (Android)
      try {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      } catch {
        return onError('Google Play Services is not available or needs to be updated.');
      }

      // Open native account picker and get ID token
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;

      if (!idToken) {
        return onError('Google sign-in did not return an ID token.');
      }

      // Create Firebase credential and authenticate
      const credential = GoogleAuthProvider.credential(idToken);
      const ok = await loginWithFirebaseCredential(credential, null, null);
      if (ok) onSuccess();
    } catch (e: any) {
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled – do nothing
        return;
      }
      if (e?.code === statusCodes.IN_PROGRESS) {
        return onError('Sign-in is already in progress.');
      }
      if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return onError('Google Play Services is not available.');
      }
      onError(e?.message ?? 'Google sign-in failed.');
    }
  }

  return (
    <Pressable
      disabled={loading}
      onPress={handleGoogle}
      className={`flex-1 ${loading ? 'opacity-60' : ''}`}
    >
      <View className="flex-row items-center justify-center rounded-full border border-tics-amber/50 bg-white/[0.06] py-6 gap-2">
        <Ionicons name="logo-google" size={18} color="#EF4444" />
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[13px] text-tics-text">Continue with Google</SafeText>
      </View>
    </Pressable>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const { token, loading, error, register, loginWithFirebaseCredential } = useAuthStore();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) return setLocalError('Please enter your first and last name.');
    const fullName = `${first} ${last}`;
    const ok = await register(email, password, fullName);
    if (ok) router.replace('/trip/add' as any);
  }

  return (
    <View className="flex-1 p-1">
      {/* Header */}
      <View className='flex-row items-center gap-3 p-2 bg-tics-amber/35 border border-tics-amber/20 rounded-full'>
        <Pressable
          onPress={() => router.replace('/home')}
          accessibilityRole="button"
          accessibilityLabel="Go to Home"
          style={{ width: 46, height: 46 }}
          className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full">
          <Ionicons name="home-outline" size={22} color="#fff" />
        </Pressable>
        <View className='flex-row items-center gap-3'>
          <View
            style={{ width: 46, height: 46 }}
            className='rounded-full justify-center items-center self-start bg-tics-amber/35 border border-tics-amber/20'>
            <Fontisto name="plane" size={17} color="#fff" />
          </View>
          <SafeText
            style={{
              fontFamily: 'ShareTech_400Regular',
            }}
            className='uppercase text-tics-text text-xl'>TICS</SafeText>
        </View>
      </View>

      <View className="mt-3 ml-2 px-1">
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontSize: 24 }} className="text-tics-amber tracking-tight">Create Account</SafeText>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-1 text-tics-muted text-[13px] leading-5">{"Let's get you started."}</SafeText>
      </View>

      <Card className="px-1">
        <ImageSlider />

        {/* Form */}
        <View className="gap-3">
          <View className="flex-row gap-3">
            <TextInput
              style={{ fontFamily: 'ShareTech_400Regular' }}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              placeholder="First Name"
              placeholderTextColor="rgba(248,250,252,0.32)"
              className="px-4 py-5 flex-1 rounded-full border border-tics-amber/30 bg-white/[0.06] text-tics-text"
            />
            <TextInput
              style={{ fontFamily: 'ShareTech_400Regular' }}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              placeholder="Last Name"
              placeholderTextColor="rgba(248,250,252,0.32)"
              className="px-4 py-5 flex-1 rounded-full border border-tics-amber/30 bg-white/[0.06] text-tics-text"
            />
          </View>

          <TextInput
            style={{ fontFamily: 'ShareTech_400Regular' }}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="Email Address"
            placeholderTextColor="rgba(248,250,252,0.32)"
            className="px-4 py-5 rounded-full border border-tics-amber/30 bg-white/[0.06] text-tics-text"
          />

          <View
            className="p-2 rounded-full border border-tics-amber/30 bg-white/[0.06]"
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
                className="ml-2 h-11 w-11 rounded-full items-center justify-center bg-tics-amber/50"
              >
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color="rgba(248,250,252,0.85)" />
              </Pressable>
            </View>
          </View>
        </View>

        {localError || error ? (
          <SafeText className="mt-2 ml-1 text-[10px] font-semibold p-0.5 rounded-full px-2 self-start bg-tics-red text-tics-bg">
            {localError ?? error}
          </SafeText>
        ) : null}

        <Pressable
          disabled={loading}
          onPress={onSubmit}
          className={`items-center justify-center py-6 bg-tics-amber/35 border border-tics-amber/20 rounded-full ${loading ? 'mt-5 opacity-60' : 'mt-5'}`}
        >
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[14px] text-tics-text">
            {loading ? 'Creating…' : 'Create Account'}
          </SafeText>
        </Pressable>

        {/* Divider */}
        <View className="mt-6 flex-row items-center gap-3">
          <View className="h-px flex-1 bg-white/10" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[11px]">or continue with</SafeText>
          <View className="h-px flex-1 bg-white/10" />
        </View>

        {/* Social sign-in */}
        <View className="mt-4 flex-row gap-3">
          {hasGoogleClientId() ? (
            <GoogleSignInButton
              onError={(m) => setLocalError(m)}
              onSuccess={() => router.replace('/trip/add' as any)}
            />
          ) : (
            <Pressable className="flex-1">
              <View className="flex-row items-center justify-center rounded-full border border-tics-amber/30 bg-white/[0.06] p-6 gap-2">
                <Ionicons name="logo-google" size={18} color="#EF4444" />
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[13px] text-tics-text">Continue with Google</SafeText>
              </View>
            </Pressable>
          )}

          {Platform.OS === 'ios' ? (
            <View className="flex-1" style={{ opacity: loading ? 0.6 : 1 }}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={16}
                style={{ height: 52, width: '100%' }}
                onPress={onApple}
              />
            </View>
          ) : (
            <>
            </>
          )}
        </View>

        <Pressable onPress={() => router.push('/auth/login')} className="mt-6">
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-center text-[12px] text-tics-muted">
            Already have an account?{' '}
            <SafeText className="text-tics-amber">Login</SafeText>
          </SafeText>
        </Pressable>
      </Card>
    </View>
  );
}
