import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';
import { syncFromEmail } from '@/src/firebase/callables';
import { useAuthStore } from '@/src/store/useAuthStore';
import { SafeText } from '@/src/components/responsive/SafeText';

type EmailSource = 'gmail' | 'outlook';

export default function EmailSyncScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [source, setSource] = useState<EmailSource>('gmail');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsedResult, setParsedResult] = useState<{
    title: string;
    from: string;
    to: string;
    departureTime: string;
    arrivalTime: string;
    airline?: string;
    flightNumber?: string;
  } | null>(null);

  const handleSync = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to sync trips from email.');
      return;
    }

    if (!subject.trim()) {
      Alert.alert('Missing field', 'Please enter the email subject.');
      return;
    }

    if (!body.trim()) {
      Alert.alert('Missing field', 'Please paste the email body/content.');
      return;
    }

    setLoading(true);
    setParsedResult(null);

    try {
      const result = await syncFromEmail({
        subject: subject.trim(),
        body: body.trim(),
        source,
      });

      if (result.ok && result.trip) {
        setParsedResult({
          title: String(result.trip.title ?? ''),
          from: String(result.trip.from ?? ''),
          to: String(result.trip.to ?? ''),
          departureTime: String(result.trip.departureTime ?? ''),
          arrivalTime: String(result.trip.arrivalTime ?? ''),
          airline: result.trip.airline ? String(result.trip.airline) : undefined,
          flightNumber: result.trip.flightNumber ? String(result.trip.flightNumber) : undefined,
        });
        Alert.alert('Trip synced!', `Successfully created "${result.trip.title}"`);
      } else {
        Alert.alert('Could not parse', result.reason ?? 'No travel data found in this email. Try a different email or use manual entry.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to sync email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    router.back();
  };

  return (
   
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView className="flex-1 p-1 pb-10">
          <View className="p-2 flex-row items-center gap-3  bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
            <Pressable
              onPress={() => router.back()}
              style={{ height: 46, width: 46 }}
              className="h-11 w-11 items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <Pressable
              style={{ height: 46, width: 46 }}
              className="h-11 w-11 items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
              <Ionicons name="mail-open" size={20} color="#fff" />
            </Pressable>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[17px]">Sync from email</SafeText>
          </View>

          <View className='px-1'>
            <Text style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-2 text-tics-text text-[13px] leading-5">
              Paste a travel confirmation email from Gmail or Outlook. TICS will automatically extract your trip details.
            </Text>
          </View>

          {/* Source selector */}
          <View className="mt-5 flex-row p-1 rounded-full border border-tics-amber/30 bg-white/[0.06] overflow-hidden">
            <Pressable
              onPress={() => setSource('gmail')}
              className={`flex-1 py-3 items-center rounded-full ${source === 'gmail' ? 'bg-tics-amber/35' : ''}`}
            >
              <Ionicons name="mail" size={20} color={source === 'gmail' ? '#96C7B3' : 'rgba(248,250,252,0.6)'} />
              <SafeText
                style={{ fontFamily: 'ShareTech_400Regular' }}
                className={`mt-1 text-[12px] ${source === 'gmail' ? 'text-tics-green' : 'text-tics-muted'}`}
              >
                Gmail
              </SafeText>
            </Pressable>
            <Pressable
              onPress={() => setSource('outlook')}
              className={`flex-1 py-3 items-center rounded-full ${source === 'outlook' ? 'bg-tics-amber/35' : ''}`}
            >
              <Ionicons name="mail-open" size={20} color={source === 'outlook' ? '#96C7B3' : 'rgba(248,250,252,0.6)'} />
              <SafeText
                style={{ fontFamily: 'ShareTech_400Regular' }}
                className={`mt-1 text-[12px] ${source === 'outlook' ? 'text-blue-400' : 'text-tics-muted'}`}
              >
                Outlook
              </SafeText>
            </Pressable>
          </View>

          {/* Subject input */}
          <View className="mt-5">
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[10px] uppercase ml-2 mb-1">Email Subject</SafeText>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="Paste the email subject line here..."
              placeholderTextColor="rgba(248,250,252,0.35)"
              className="border border-tics-amber/30 bg-white/[0.06] rounded-full px-3 py-5 text-tics-text text-[14px]"
              style={{ fontFamily: 'ShareTech_400Regular' }}
            />
          </View>

          {/* Body input */}
          <View className="mt-4">
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[10px] uppercase ml-2 mb-2">Email Body</SafeText>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Paste the full email content here..."
              placeholderTextColor="rgba(248,250,252,0.35)"
              multiline
              numberOfLines={10}
              textAlignVertical="top"
              className="border border-tics-amber/30 bg-white/[0.06] rounded-4xl px-4 py-4 text-tics-text text-[14px] min-h-[200px]"
              style={{ fontFamily: 'ShareTech_400Regular' }}
            />
          </View>

          {/* How to get email content */}
        <Card accent="blue" className="mt-5 bg-tics-amber/25 border border-tics-amber/10 rounded-4xl px-4 py-3">
            <View className="flex-row items-start">
              <Ionicons name="information-circle" size={18} color="#F59E0B" style={{ marginTop: 2 }} />
              <View className="ml-3 flex-1">
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[12px] font-semibold">How to get email content</SafeText>
                <Text style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-1 text-tics-muted text-[11px] leading-4">
                  Open the travel confirmation email in Gmail or Outlook, select "Copy" or "Show original", and paste the full content above.
                </Text>
              </View>
            </View>
          </Card>

          {/* Parse button */}
          <Pressable
            onPress={handleSync}
            disabled={loading}
            className="mt-6 bg-tics-amber/35 border border-tics-amber/20 rounded-full py-6 items-center"
          >
            {loading ? (
              <ActivityIndicator color="#22c55e" />
            ) : (
              <View className="flex-row items-center">
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="ml-2 text-tics-text text-[15px]">Parse & Sync Trip</SafeText>
              </View>
            )}
          </Pressable>

          {/* Parsed result */}
          {parsedResult && (
            <Card accent="green" className="mt-5 bg-tics-green/10 border border-tics-green/30 rounded-xl px-4 py-4">
              <View className="flex-row items-center mb-3">
                <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="ml-2 text-tics-text text-[16px]">Trip Synced!</SafeText>
              </View>
              <View className="gap-2">
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[14px]">{parsedResult.title}</SafeText>
                <View className="flex-row">
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[12px] w-20">Route:</SafeText>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[12px]">{parsedResult.from} → {parsedResult.to}</SafeText>
                </View>
                {parsedResult.airline && (
                  <View className="flex-row">
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[12px] w-20">Airline:</SafeText>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[12px]">{parsedResult.airline}</SafeText>
                  </View>
                )}
                {parsedResult.flightNumber && (
                  <View className="flex-row">
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[12px] w-20">Flight:</SafeText>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[12px]">{parsedResult.flightNumber}</SafeText>
                  </View>
                )}
                <View className="flex-row">
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[12px] w-20">Departs:</SafeText>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[12px]">{new Date(parsedResult.departureTime).toLocaleString()}</SafeText>
                </View>
              </View>

              <Pressable
                onPress={handleDone}
                className="mt-4 bg-tics-green/20 border border-tics-green/40 rounded-xl py-3 items-center"
              >
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-green text-[14px]">Done — Back to trips</SafeText>
              </Pressable>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    
  );
}
