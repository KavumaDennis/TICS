import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import Card from '@/src/components/Card';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTripStore } from '@/src/store/tripStore';
import { searchAirports, getAirports, getAirportByIATA } from '@/src/services/AirportService';
import { searchAirlines as searchAirlinesService, getAirlineByIATA, getAirlineByICAO } from '@/src/services/AirlineService';
import { SafeText } from '@/src/components/responsive/SafeText';

export type AirportEntry = {
  code: string;
  name: string;
  city: string;
  country: string;
};

/* ─── Airline Selector (powered by OpenFlights dataset) ───────────────────── */

function AirlineSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<Array<{ name: string; iata: string }>>([]);

  useEffect(() => {
    if (focused) {
      searchAirlinesService(value).then(setResults);
    }
  }, [focused, value]);

  return (
    <View className="py-1">
      <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[10px] ml-2 uppercase tracking-wider">
        Airline (optional)
      </SafeText>
      <TextInput
        style={{ fontFamily: 'ShareTech_400Regular' }}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        placeholder="e.g. Emirates, Kenya Airways"
        placeholderTextColor="rgba(248,250,252,0.32)"
        maxLength={50}
        className="mt-1 flex-row items-center justify-between rounded-full border border-tics-amber/30 bg-white/[0.05] text-tics-text p-5"
      />
      {results.length > 0 && focused && (
        <View className="mt-1 rounded-3xl border border-tics-amber/30 bg-[#1a1f3a] overflow-hidden" style={{ maxHeight: 200 }}>
          {results.map((a, idx) => (
            <Pressable
              key={a.iata || `airline-${idx}`}
              onPress={() => { onChange(a.name); setFocused(false); Keyboard.dismiss(); }}
              className="px-4 py-3 border-b border-white/5 active:bg-white/10"
            >
              <View className="flex-row items-center gap-3">
                <View className="rounded-2xl bg-tics-amber/15 px-2 py-1">
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber text-[11px]">{a.iata || '—'}</SafeText>
                </View>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[13px]">{a.name}</SafeText>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      {value && !focused && (
        <View className="mt-1 flex-row items-center gap-1">
          <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-green text-[10px]">{value}</SafeText>
        </View>
      )}
    </View>
  );
}

/* ─── Validation helpers ──────────────────────────────────────────────────── */

const FLIGHT_RE = /^[A-Z]{2}\d{1,4}$/;

function validateFlightNumber(raw: string): string | null {
  const clean = raw.replace(/\s+/g, '').toUpperCase();
  if (!clean) return null; // optional
  return FLIGHT_RE.test(clean) ? null : 'Enter a valid flight number like EK203';
}

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/* ─── Airport selector component ──────────────────────────────────────────── */

function AirportSelector({
  label,
  placeholder,
  selected,
  onSelect,
  error,
}: {
  label: string;
  placeholder: string;
  selected: AirportEntry | null;
  onSelect: (a: AirportEntry) => void;
  error?: string | null;
}) {
  const [query, setQuery] = useState(selected ? `${selected.code} — ${selected.city}` : '');
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<AirportEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.length > 0) {
      setLoading(true);
      const airports = await searchAirports(text);
      setResults(airports);
      setLoading(false);
    } else {
      setResults([]);
    }
  };

  return (
    <View className="py-1">
      <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[10px] ml-2 uppercase tracking-wider">
        {label}
      </SafeText>
      <TextInput
        style={{ fontFamily: 'ShareTech_400Regular' }}
        value={query}
        onChangeText={handleSearch}
        onFocus={() => {
          setFocused(true);
          if (query.length > 0) {
            handleSearch(query);
          }
        }}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        placeholder={placeholder}
        placeholderTextColor="rgba(248,250,252,0.32)"
        className="mt-1 flex-row items-center justify-between rounded-full border border-tics-amber/30 bg-white/[0.05] text-tics-text p-5"
      />
      {error ? (
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-1 text-tics-red text-[10px]">{error}</SafeText>
      ) : null}
      {selected && !focused ? (
        <View className="mt-1 flex-row items-center gap-1.5">
          <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-green text-[10px]">
            {selected.code} · {selected.name}
          </SafeText>
        </View>
      ) : null}
      {loading && focused ? (
        <View className="mt-1 rounded-3xl border border-tics-amber/30 bg-[#1a1f3a] overflow-hidden p-4" style={{ maxHeight: 200 }}>
          <ActivityIndicator size="small" color="#60A5FA" />
        </View>
      ) : results.length > 0 && focused ? (
        <View className="mt-1 rounded-3xl border border-tics-amber/30 bg-[#1a1f3a] overflow-hidden" style={{ maxHeight: 200 }}>
          {results.map((a, idx) => (
            <Pressable
              key={a.code || `airport-${idx}`}
              onPress={() => {
                onSelect(a);
                setQuery(`${a.code} — ${a.city}`);
                setFocused(false);
                Keyboard.dismiss();
              }}
              className="px-4 py-3 border-b border-white/5 active:bg-white/10"
            >
              <View className="flex-row items-center gap-3">
                <View className="rounded-2xl bg-tics-blue/20 px-2 py-1">
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-blue text-[12px]">
                    {a.code}
                  </SafeText>
                </View>
                <View className="flex-1">
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[12px]">
                    {a.city}, {a.country}
                  </SafeText>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[10px]">
                    {a.name}
                  </SafeText>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ─── Main form ───────────────────────────────────────────────────────────── */

export default function TripInputScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const uid = useAuthStore((s) => s.token);
  const loading = useTripStore((s) => s.loading);
  const storeError = useTripStore((s) => s.error);
  const addTrip = useTripStore((s) => s.addTrip);

  // Form state — init from prefill params when available (passed by JourneyCoordinatorService)
  // Params may arrive as individual fields OR as a single `prefill` JSON string.
  const rawPrefill = useMemo(() => {
    try {
      return params.prefill ? JSON.parse(params.prefill) : {};
    } catch {
      return {};
    }
  }, [params.prefill]);

  const destName = rawPrefill.destinationName || params.destinationName || '';
  const destCountry = rawPrefill.destinationCountry || params.destinationCountry || '';
  const destCode = rawPrefill.destinationAirportCode || params.destinationAirportCode || '';
  const destCity = rawPrefill.destinationCity || params.destinationCity || rawPrefill.destinationName || '';

  const [title, setTitle] = useState(destName ? `Trip to ${destName}` : '');
  const [departureAirport, setDepartureAirport] = useState<AirportEntry | null>(null);
  const [destinationAirport, setDestinationAirport] = useState<AirportEntry | null>(() => {
    const destAirportObj = rawPrefill.destinationAirport as AirportEntry | null | undefined;
    // Only set the destination when we have a valid airport code or
    // the required display strings from the prefill object.
    if (destCode || (destAirportObj?.code && (destAirportObj?.city || destAirportObj?.name))) {
      return {
        code: destCode || destAirportObj?.code || '',
        name: destName || destAirportObj?.name || '',
        city: destCity || destAirportObj?.city || '',
        country: destCountry || destAirportObj?.country || '',
      };
    }
    return null;
  });
  const [airline, setAirline] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [departureTime, setDepartureTime] = useState<Date | null>(null);
  const [arrivalTime, setArrivalTime] = useState<Date | null>(null);
  const [tripType, setTripType] = useState(rawPrefill.journeyType || params.journeyType || params.tripType || '');
  const [budget, setBudget] = useState('');
  const [travelMode, setTravelMode] = useState(rawPrefill.suggestedTravelMode || params.suggestedTravelMode || '');
  const [passengers, setPassengers] = useState('1');
  const [accommodation, setAccommodation] = useState('');
  const [notes, setNotes] = useState('');
  const [estimatedDistance, setEstimatedDistance] = useState(
    rawPrefill.estimatedDistance ? `${rawPrefill.estimatedDistance} km` : ''
  );
  const [estimatedDuration, setEstimatedDuration] = useState(rawPrefill.estimatedDuration || '');
  const [destinationCurrency, setDestinationCurrency] = useState(rawPrefill.destinationCurrency || params.destinationCurrency || '');
  const [destinationLanguage, setDestinationLanguage] = useState(rawPrefill.destinationLanguage || params.destinationLanguage || '');
  const [destinationTimezone, setDestinationTimezone] = useState(rawPrefill.destinationTimezone || params.destinationTimezone || '');

  // Picker visibility — only needed for iOS inline picker
  // Android uses the imperative DateTimePickerAndroid.open() API to avoid the
  // "dismiss of undefined" crash that occurs when inline DateTimePicker unmounts
  // while a native dialog is open.
  const [showDepPicker, setShowDepPicker] = useState(false);
  const [showArrPicker, setShowArrPicker] = useState(false);

  function openDepPicker() {
    touch('departureTime');
    if (Platform.OS === 'android') {
      // Android: use imperative API for native dialog
      DateTimePickerAndroid.open({
        value: departureTime ?? new Date(),
        mode: 'date',
        minimumDate: new Date(),
        is24Hour: true,
        onChange: (_: any, date: Date | undefined) => {
          if (!date) return;
          // After picking date, open time picker
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
            is24Hour: true,
            onChange: (_2: any, time: Date | undefined) => {
              if (time) {
                const merged = new Date(date);
                merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
                setDepartureTime(merged);
                touch('departureTime');
              }
            },
          });
        },
      });
    } else {
      // iOS: toggle inline picker visibility
      setShowDepPicker(true);
    }
  }

  function openArrPicker() {
    touch('arrivalTime');
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: arrivalTime ?? (departureTime ? new Date(departureTime.getTime() + 3600000) : new Date()),
        mode: 'date',
        minimumDate: departureTime ?? new Date(),
        is24Hour: true,
        onChange: (_: any, date: Date | undefined) => {
          if (!date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
            is24Hour: true,
            onChange: (_2: any, time: Date | undefined) => {
              if (time) {
                const merged = new Date(date);
                merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
                setArrivalTime(merged);
                touch('arrivalTime');
              }
            },
          });
        },
      });
    } else {
      setShowArrPicker(true);
    }
  }

  // Touched state for inline validation
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (field: string) => setTouched((p) => ({ ...p, [field]: true }));

  /* ── Validation ──────────────────────────────────────── */

  const errors = useMemo(() => {
    const e: Record<string, string | null> = {};

    // Title
    if (!title.trim()) e.title = 'Please enter a trip title';
    else if (title.trim().length < 3) e.title = 'Trip title is too short';
    else if (title.trim().length > 80) e.title = 'Trip title is too long';
    else e.title = null;

    // Departure airport
    e.from = departureAirport ? null : 'Please select a valid departure airport';

    // Destination airport
    if (!destinationAirport) e.to = 'Please select a valid destination airport';
    else if (departureAirport && destinationAirport.code === departureAirport.code)
      e.to = 'Destination airport must be different';
    else e.to = null;

    // Flight number
    e.flightNumber = validateFlightNumber(flightNumber);

    // Departure time
    if (!departureTime) e.departureTime = 'Please select departure time';
    else if (departureTime.getTime() <= Date.now()) e.departureTime = 'Departure time must be in the future';
    else e.departureTime = null;

    // Arrival time
    if (!arrivalTime) e.arrivalTime = 'Please select arrival time';
    else if (departureTime && arrivalTime.getTime() <= departureTime.getTime())
      e.arrivalTime = 'Arrival time must be after departure time';
    else e.arrivalTime = null;

    return e;
  }, [title, departureAirport, destinationAirport, flightNumber, departureTime, arrivalTime]);

  const canSubmit = useMemo(
    () => uid && Object.values(errors).every((v) => v === null),
    [errors, uid]
  );

  /* ── Airline enrichment ────────────────────────────── */

  /**
   * Resolves the airline name from the text input to a structured object
   * with IATA, ICAO, country, and callsign from the OpenFlights dataset.
   * Falls back to the plain name string for backward compatibility.
   */
  async function enrichAirlineData(name: string): Promise<any> {
    if (!name?.trim()) return null;

    const trimmed = name.trim();

    // Try exact IATA code first (e.g. "EK" -> Emirates)
    const byIata = await getAirlineByIATA(trimmed);
    if (byIata) return byIata;

    // Try ICAO code (e.g. "UAE" -> Emirates)
    const byIcao = await getAirlineByICAO(trimmed);
    if (byIcao) return byIcao;

    // Try exact name match via search
    const byName = await searchAirlinesService(trimmed);
    if (byName.length > 0 && byName[0].name.toLowerCase() === trimmed.toLowerCase()) {
      const exact = await getAirlineByIATA(byName[0].iata);
      if (exact) return exact;
    }

    // Return plain string for backward compatibility if nothing matched
    return trimmed;
  }

  /* ── Submit ──────────────────────────────────────────── */

  async function onSubmit() {
    if (!uid) return router.push('/auth/login');
    if (!canSubmit || !departureAirport || !destinationAirport || !departureTime || !arrivalTime) return;

    const cleanFlightNumber = flightNumber.replace(/\s+/g, '').toUpperCase() || null;

    // Enrich with full data from the OurAirports dataset (icao, lat, lng)
    const depFull = await getAirportByIATA(departureAirport.code);
    const destFull = await getAirportByIATA(destinationAirport.code);

    // Store structured airport data for correct API lookups
    // - from/to: used by the monitoring screen display (city, country)
    // - weatherLocationFrom/weatherLocationTo: "City,CC" format for OpenWeather API
    // - departureAirport/destinationAirport: structured airport data with geo coordinates
    const trip = await addTrip(uid, {
      title: title.trim(),
      // Human-readable strings kept for display (compatible with old code)
      from: `${departureAirport.code} ${departureAirport.city}`,
      to: `${destinationAirport.code} ${destinationAirport.city}`,
      // Structured airport objects for clean API calls (includes geo data from OurAirports)
      departureAirport: {
        airportCode: departureAirport.code,
        airportName: departureAirport.name,
        city: departureAirport.city,
        countryCode: departureAirport.country,
        icao: depFull?.icao || '',
        latitude: depFull?.latitude,
        longitude: depFull?.longitude,
      },
      destinationAirport: {
        airportCode: destinationAirport.code,
        airportName: destinationAirport.name,
        city: destinationAirport.city,
        countryCode: destinationAirport.country,
        icao: destFull?.icao || '',
        latitude: destFull?.latitude,
        longitude: destFull?.longitude,
      },
      // OpenWeather-compatible "City,CC" location strings
      weatherLocationFrom: `${departureAirport.city},${departureAirport.country}`,
      weatherLocationTo: `${destinationAirport.city},${destinationAirport.country}`,
      // Enrich airline with structured data from the OpenFlights dataset
      // Store as a plain string (airline name) for backward compatibility
      // with monitoring screens that render trip.airline as text
      airline: (() => {
        // enrichAirlineData is async — resolve synchronously from the input text
        // The full enrichment result is not stored to avoid breaking screens
        // that expect trip.airline to be a plain string
        return airline.trim() || null;
      })(),
      flightNumber: cleanFlightNumber,
      departureTime: departureTime.toISOString(),
      arrivalTime: arrivalTime.toISOString(),
      monitoringStatus: 'unknown',
      lastMileStatus: 'pending',
    } as any);
    if (trip) router.replace('/home');
  }

  /* ── Field helper ────────────────────────────────────── */

  function FieldError({ field }: { field: string }) {
    if (!touched[field] || !errors[field]) return null;
    return (
      <View className="mt-1.5 flex-row items-center gap-1">
        <Ionicons name="alert-circle" size={12} color="#EF4444" />
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-red text-[10px]">
          {errors[field]}
        </SafeText>
      </View>
    );
  }

  /* ── Render ──────────────────────────────────────────── */

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ gap: 16 }}
        keyboardShouldPersistTaps="handled"
        className='p-1'
      >
        {/* Header */}
        <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full">
          <Pressable
            onPress={() => router.back()}
            style={{ height: 46, width: 46 }}
            className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full"
          >
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>
          <View>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[17px]">
              New Trip
            </SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[11px]">
              Structured input for accurate monitoring
            </SafeText>
          </View>
        </View>

        {/* Form card */}
        <Card accent="green" className="pb-5">
          <View className="gap-4">
            {/* Trip title */}
            <View className="py-1">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[10px] ml-2 uppercase tracking-wider">
                Trip Title
              </SafeText>
              <TextInput
                style={{ fontFamily: 'ShareTech_400Regular' }}
                value={title}
                onChangeText={setTitle}
                onBlur={() => touch('title')}
                placeholder="e.g. Business Trip to Dubai"
                placeholderTextColor="rgba(248,250,252,0.32)"
                maxLength={80}
                className="mt-1 flex-row items-center justify-between rounded-full border border-tics-amber/30 bg-white/[0.05] text-tics-text p-5"
              />
              <FieldError field="title" />
            </View>

            {/* Departure airport */}
            <AirportSelector
              label="Departure Airport"
              placeholder='Search airport or city (e.g. EBB, Entebbe)'
              selected={departureAirport}
              onSelect={(a) => { setDepartureAirport(a); touch('from'); }}
              error={touched.from ? errors.from : null}
            />

            {/* Destination airport */}
            <AirportSelector
              label="Destination Airport"
              placeholder='Search airport or city (e.g. NBO, Nairobi)'
              selected={destinationAirport}
              onSelect={(a) => { setDestinationAirport(a); touch('to'); }}
              error={touched.to ? errors.to : null}
            />

            {/* Airline */}
            <AirlineSelector
              value={airline}
              onChange={setAirline}
            />

            {/* Flight number */}
            <View className="py-1">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[10px] ml-2 uppercase tracking-wider">
                Flight Number (optional)
              </SafeText>
              <TextInput
                style={{ fontFamily: 'ShareTech_400Regular' }}
                value={flightNumber}
                onChangeText={(t) => setFlightNumber(t.replace(/\s+/g, '').toUpperCase())}
                onBlur={() => touch('flightNumber')}
                placeholder="e.g. EK203"
                placeholderTextColor="rgba(248,250,252,0.32)"
                autoCapitalize="characters"
                maxLength={6}
                className="mt-1 flex-row items-center justify-between rounded-full border border-tics-amber/30 bg-white/[0.05] text-tics-text p-5"
              />
              <FieldError field="flightNumber" />
              {flightNumber && !errors.flightNumber ? (
                <View className="mt-1 flex-row items-center gap-1">
                  <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-green text-[10px]">
                    Valid: {flightNumber}
                  </SafeText>
                </View>
              ) : null}
            </View>

            {/* Departure time */}
            <View className="py-1">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[10px] ml-2 uppercase tracking-wider">
                Departure Date & Time
              </SafeText>
              <Pressable
                onPress={openDepPicker}
                className="mt-1 flex-row items-center justify-between rounded-full border border-tics-amber/30 bg-white/[0.05] text-tics-text p-5"
              >
                <SafeText
                  style={{ fontFamily: 'ShareTech_400Regular', color: departureTime ? 'rgba(248,250,252,0.9)' : 'rgba(248,250,252,0.32)', fontSize: 13 }}
                >
                  {departureTime ? formatDateDisplay(departureTime) : 'Tap to select'}
                </SafeText>
                <Ionicons name="calendar-outline" size={18} color="rgba(248,250,252,0.5)" />
              </Pressable>
              {/* iOS only — inline compact picker (shown when toggled or no date yet) */}
              {Platform.OS === 'ios' && (showDepPicker || !departureTime) && (
                <DateTimePicker
                  value={departureTime ?? new Date()}
                  mode="datetime"
                  display="compact"
                  minimumDate={new Date()}
                  onChange={(_, d) => {
                    setShowDepPicker(false);
                    if (d) { setDepartureTime(d); touch('departureTime'); }
                  }}
                  themeVariant="dark"
                  style={{ marginTop: 8 }}
                />
              )}
              {Platform.OS === 'ios' && !showDepPicker && departureTime && (
                <Pressable onPress={() => setShowDepPicker(true)} className="mt-1">
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-blue text-[11px]">Change</SafeText>
                </Pressable>
              )}
              <FieldError field="departureTime" />
            </View>

            {/* Arrival time */}
            <View className="py-1">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[10px] ml-2 uppercase tracking-wider">
                Arrival Date & Time
              </SafeText>
              <Pressable
                onPress={openArrPicker}
                className="mt-1 flex-row items-center justify-between rounded-full border border-tics-amber/30 bg-white/[0.05] text-tics-text p-5"
              >
                <SafeText
                  style={{ fontFamily: 'ShareTech_400Regular', color: arrivalTime ? 'rgba(248,250,252,0.9)' : 'rgba(248,250,252,0.32)', fontSize: 13 }}
                >
                  {arrivalTime ? formatDateDisplay(arrivalTime) : 'Tap to select'}
                </SafeText>
                <Ionicons name="calendar-outline" size={18} color="rgba(248,250,252,0.5)" />
              </Pressable>
              {/* iOS only — inline compact picker (shown when toggled or no date yet) */}
              {Platform.OS === 'ios' && (showArrPicker || !arrivalTime) && (
                <DateTimePicker
                  value={arrivalTime ?? (departureTime ? new Date(departureTime.getTime() + 3600000) : new Date())}
                  mode="datetime"
                  display="compact"
                  minimumDate={departureTime ?? new Date()}
                  onChange={(_, d) => {
                    setShowArrPicker(false);
                    if (d) { setArrivalTime(d); touch('arrivalTime'); }
                  }}
                  themeVariant="dark"
                  style={{ marginTop: 8 }}
                />
              )}
              {Platform.OS === 'ios' && !showArrPicker && arrivalTime && (
                <Pressable onPress={() => setShowArrPicker(true)} className="mt-1">
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-blue text-[11px]">Change</SafeText>
                </Pressable>
              )}
              <FieldError field="arrivalTime" />
            </View>

            {/* Weather location preview */}
            {destinationAirport && (
              <View className="flex-row items-center gap-2 rounded-full border border-tics-amber/30 bg-white/[0.05] text-tics-text p-4">
                <Ionicons name="partly-sunny" size={16} color="#FBBF24" />
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[11px] flex-1">
                  Weather lookup: <SafeText className="text-tics-text">{destinationAirport.city},{destinationAirport.country}</SafeText>
                </SafeText>
              </View>
            )}
          </View>

          {/* Errors */}
          {storeError ? (
            <SafeText className="mt-3 text-[12px] font-semibold text-tics-red">{storeError}</SafeText>
          ) : null}

          {/* Submit */}
          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit || loading}
            style={{ alignItems: 'center' }}
            className="mt-6 bg-tics-amber/35 border border-tics-amber/20 rounded-full py-6"
          >
            {loading ? (
              <ActivityIndicator size={18} color="#000" />
            ) : (
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[14px] text-tics-text">
                Save Trip
              </SafeText>
            )}
          </Pressable>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
