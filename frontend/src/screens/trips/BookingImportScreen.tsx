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
import { Ionicons, Entypo } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';
import { importFromBooking } from '@/src/firebase/callables';
import { useAuthStore } from '@/src/store/useAuthStore';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function BookingImportScreen() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);

    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [fromEmail, setFromEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [parsedResult, setParsedResult] = useState<{
        title: string;
        from: string;
        to: string;
        departureTime: string;
        arrivalTime: string;
        airline?: string;
        flightNumber?: string;
        provider?: string;
        hotelName?: string;
        totalPrice?: string;
    } | null>(null);

    const handleImport = async () => {
        if (!user) {
            Alert.alert('Sign in required', 'Please sign in to import bookings.');
            return;
        }

        if (!subject.trim()) {
            Alert.alert('Missing field', 'Please enter the booking email subject.');
            return;
        }

        if (!body.trim()) {
            Alert.alert('Missing field', 'Please paste the booking email content.');
            return;
        }

        setLoading(true);
        setParsedResult(null);

        try {
            const result = await importFromBooking({
                subject: subject.trim(),
                body: body.trim(),
                fromEmail: fromEmail.trim() || undefined,
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
                    provider: result.trip.provider ? String(result.trip.provider) : undefined,
                    hotelName: result.trip.hotelName ? String(result.trip.hotelName) : undefined,
                    totalPrice: result.trip.totalPrice ? String(result.trip.totalPrice) : undefined,
                });
                Alert.alert('Booking imported!', `Successfully created "${result.trip.title}"`);
            } else {
                Alert.alert('Could not parse', result.reason ?? 'No booking data found. Try a different confirmation email or use manual entry.');
            }
        } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'Failed to import booking. Please try again.');
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
                <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-4">
                    <Pressable
                     onPress={() => router.back()} 
                     style={{ height: 46, width: 46 }}
                     className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
                        <Ionicons name="chevron-back" size={22} color="#fff" />
                    </Pressable>
                    <Pressable
                    style={{ height: 46, width: 46 }} 
                    className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
                        <Entypo name="book" size={20} color="#fff" />
                    </Pressable>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[17px]">Import from booking</SafeText>
                </View>

                <View>
                    <Text style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[13px] leading-5 mb-4 px-1">
                        Paste a booking confirmation from Expedia, Booking.com, Kayak, Skyscanner, or any travel site. TICS will extract your trip details.
                    </Text>
                </View>

                {/* Supported providers info */}
                <Card accent="purple" className="mt-3 rounded-4xl bg-tics-amber/25 border border-tics-amber/10 px-5 py-3">
                    <View className="flex-col items-start">
                        {/* <Ionicons name="globe" size={18} color="#F59E0B" style={{ marginTop: 2 }} /> */}
                        <View className="flex-1">
                            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[12px] font-semibold">Supported booking sites</SafeText>
                            <Text style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-1 text-tics-muted text-[11px] leading-4">
                                Expedia, Booking.com, Kayak, Skyscanner, Priceline, Orbitz, Travelocity, Hotels.com, Google Flights, Kiwi.com, and more.
                            </Text>
                        </View>
                    </View>
                </Card>

                {/* From email (optional) */}
                <View className="mt-5">
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[10px] uppercase ml-2 mb-1">From Email (optional)</SafeText>
                    <TextInput
                        value={fromEmail}
                        onChangeText={setFromEmail}
                        placeholder="e.g. confirmation@expedia.com"
                        placeholderTextColor="rgba(248,250,252,0.35)"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        className="border border-tics-amber/30 bg-white/[0.06] rounded-full px-3 py-5 text-tics-text text-[14px]"
                        style={{ fontFamily: 'ShareTech_400Regular' }}
                    />
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-1 ml-2 text-tics-muted text-[10px]">
                        Helps identify the booking provider. Not required.
                    </SafeText>
                </View>

                {/* Subject input */}
                <View className="mt-4">
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[10px] uppercase ml-2 mb-1">Email Subject</SafeText>
                    <TextInput
                        value={subject}
                        onChangeText={setSubject}
                        placeholder="Paste the booking confirmation subject..."
                        placeholderTextColor="rgba(248,250,252,0.35)"
                        className="border border-tics-amber/30 bg-white/[0.06] rounded-full px-3 py-5 text-tics-text text-[14px]"
                        style={{ fontFamily: 'ShareTech_400Regular' }}
                    />
                </View>

                {/* Body input */}
                <View className="mt-4">
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[10px] uppercase ml-2 mb-1">Email Body</SafeText>
                    <TextInput
                        value={body}
                        onChangeText={setBody}
                        placeholder="Paste the full booking confirmation email here..."
                        placeholderTextColor="rgba(248,250,252,0.35)"
                        multiline
                        numberOfLines={10}
                        textAlignVertical="top"
                        className="border border-tics-amber/30 bg-white/[0.06] rounded-4xl px-3 py-4 text-tics-text text-[14px] min-h-[200px]"
                        style={{ fontFamily: 'ShareTech_400Regular' }}
                    />
                </View>

                {/* Import button */}
                <Pressable
                    onPress={handleImport}
                    disabled={loading}
                    className="mt-6 bg-tics-amber/35 border border-tics-amber/20 rounded-full py-6 items-center"
                >
                    {loading ? (
                        <ActivityIndicator color="#f59e0b" />
                    ) : (
                        <View className="flex-row items-center">
                            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="ml-2 text-tics-text text-[15px]">Parse & Import Trip</SafeText>
                        </View>
                    )}
                </Pressable>

                {/* Parsed result */}
                {parsedResult && (
                    <Card accent="amber" className="mt-5 bg-tics-amber/10 border border-tics-amber/30 rounded-xl px-4 py-4">
                        <View className="flex-row items-center mb-3">
                            <Ionicons name="checkmark-circle" size={20} color="#f59e0b" />
                            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="ml-2 text-tics-text text-[16px]">Booking Imported!</SafeText>
                        </View>
                        <View className="gap-2">
                            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[14px]">{parsedResult.title}</SafeText>
                            {parsedResult.provider && (
                                <View className="flex-row">
                                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[12px] w-20">Provider:</SafeText>
                                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[12px]">{parsedResult.provider}</SafeText>
                                </View>
                            )}
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
                            {parsedResult.hotelName && (
                                <View className="flex-row">
                                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[12px] w-20">Hotel:</SafeText>
                                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[12px]">{parsedResult.hotelName}</SafeText>
                                </View>
                            )}
                            {parsedResult.totalPrice && (
                                <View className="flex-row">
                                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[12px] w-20">Price:</SafeText>
                                    <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[12px]">${parsedResult.totalPrice}</SafeText>
                                </View>
                            )}
                            <View className="flex-row">
                                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[12px] w-20">Departs:</SafeText>
                                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[12px]">{new Date(parsedResult.departureTime).toLocaleString()}</SafeText>
                            </View>
                        </View>

                        <Pressable
                            onPress={handleDone}
                            className="mt-4 bg-tics-amber rounded-xl py-3 items-center"
                        >
                            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-bg text-[14px]">Done — Back to trips</SafeText>
                        </Pressable>
                    </Card>
                )}
            </ScrollView>
        </KeyboardAvoidingView>

    );
}
