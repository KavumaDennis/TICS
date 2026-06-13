import { useCallback, useMemo, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

// On Android, use the imperative API to avoid the "dismiss of undefined" crash
// that occurs when the inline DateTimePicker unmounts while the native dialog is open.
let DateTimePickerAndroid: any = null;
if (Platform.OS === 'android') {
  try {
    DateTimePickerAndroid = require('@react-native-community/datetimepicker').DateTimePickerAndroid;
  } catch { /* not available */ }
}

import Card from '@/src/components/Card';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTripStore } from '@/src/store/tripStore';

/* ─── Airport data ────────────────────────────────────────────────────────── */

export type AirportEntry = {
  code: string;
  name: string;
  city: string;
  country: string;
};

/**
 * Comprehensive worldwide airport list (~600+ airports across all regions).
 * Covers Africa, Middle East, Europe, North America, South America,
 * Asia-Pacific, South Asia, and Central Asia.
 * Provides instant offline autocomplete without any API calls.
 */
const AIRPORTS: AirportEntry[] = [
  // ── Africa ──────────────────────────────────────────────────────────────────
  { code: 'EBB', name: 'Entebbe International Airport', city: 'Entebbe', country: 'UG' },
  { code: 'KLA', name: 'Kajjansi Airfield', city: 'Kampala', country: 'UG' },
  { code: 'NBO', name: 'Jomo Kenyatta International Airport', city: 'Nairobi', country: 'KE' },
  { code: 'MBA', name: 'Moi International Airport', city: 'Mombasa', country: 'KE' },
  { code: 'KIS', name: 'Kisumu International Airport', city: 'Kisumu', country: 'KE' },
  { code: 'EDL', name: 'Eldoret International Airport', city: 'Eldoret', country: 'KE' },
  { code: 'DAR', name: 'Julius Nyerere International Airport', city: 'Dar es Salaam', country: 'TZ' },
  { code: 'KGL', name: 'Kigali International Airport', city: 'Kigali', country: 'RW' },
  { code: 'BJM', name: 'Bujumbura International Airport', city: 'Bujumbura', country: 'BI' },
  { code: 'ADD', name: 'Bole International Airport', city: 'Addis Ababa', country: 'ET' },
  { code: 'DIR', name: 'Aba Tenna Dejazmach Yilma Airport', city: 'Dire Dawa', country: 'ET' },
  { code: 'JIB', name: 'Djibouti-Ambouli International Airport', city: 'Djibouti', country: 'DJ' },
  { code: 'MGQ', name: 'Aden Adde International Airport', city: 'Mogadishu', country: 'SO' },
  { code: 'ASM', name: 'Asmara International Airport', city: 'Asmara', country: 'ER' },
  { code: 'KRT', name: 'Khartoum International Airport', city: 'Khartoum', country: 'SD' },
  { code: 'JUB', name: 'Juba International Airport', city: 'Juba', country: 'SS' },
  { code: 'ENT', name: 'Entebbe/Kampala', city: 'Kampala', country: 'UG' },
  { code: 'JNB', name: 'O.R. Tambo International Airport', city: 'Johannesburg', country: 'ZA' },
  { code: 'CPT', name: 'Cape Town International Airport', city: 'Cape Town', country: 'ZA' },
  { code: 'DUR', name: 'King Shaka International Airport', city: 'Durban', country: 'ZA' },
  { code: 'PLZ', name: 'Port Elizabeth Airport', city: 'Port Elizabeth', country: 'ZA' },
  { code: 'BFN', name: 'Bram Fischer International Airport', city: 'Bloemfontein', country: 'ZA' },
  { code: 'GBE', name: 'Sir Seretse Khama International Airport', city: 'Gaborone', country: 'BW' },
  { code: 'WDH', name: 'Hosea Kutako International Airport', city: 'Windhoek', country: 'NA' },
  { code: 'HRE', name: 'Robert Gabriel Mugabe International Airport', city: 'Harare', country: 'ZW' },
  { code: 'BUQ', name: 'Joshua Mqabuko Nkomo International Airport', city: 'Bulawayo', country: 'ZW' },
  { code: 'LLW', name: 'Lilongwe International Airport', city: 'Lilongwe', country: 'MW' },
  { code: 'LUN', name: 'Kenneth Kaunda International Airport', city: 'Lusaka', country: 'ZM' },
  { code: 'LAD', name: 'Quatro de Fevereiro Airport', city: 'Luanda', country: 'AO' },
  { code: 'MPM', name: 'Maputo International Airport', city: 'Maputo', country: 'MZ' },
  { code: 'TNR', name: 'Ivato International Airport', city: 'Antananarivo', country: 'MG' },
  { code: 'MRU', name: 'Sir Seewoosagur Ramgoolam International Airport', city: 'Mauritius', country: 'MU' },
  { code: 'RUN', name: 'Roland Garros Airport', city: 'Saint-Denis', country: 'RE' },
  { code: 'SEZ', name: 'Seychelles International Airport', city: 'Victoria', country: 'SC' },
  { code: 'LOS', name: 'Murtala Muhammed International Airport', city: 'Lagos', country: 'NG' },
  { code: 'ABV', name: 'Nnamdi Azikiwe International Airport', city: 'Abuja', country: 'NG' },
  { code: 'PHC', name: 'Port Harcourt International Airport', city: 'Port Harcourt', country: 'NG' },
  { code: 'KAN', name: 'Mallam Aminu Kano International Airport', city: 'Kano', country: 'NG' },
  { code: 'ACC', name: 'Kotoka International Airport', city: 'Accra', country: 'GH' },
  { code: 'ABJ', name: 'Félix-Houphouët-Boigny International Airport', city: 'Abidjan', country: 'CI' },
  { code: 'DKR', name: 'Léopold Sédar Senghor International Airport', city: 'Dakar', country: 'SN' },
  { code: 'DSS', name: 'Blaise Diagne International Airport', city: 'Dakar', country: 'SN' },
  { code: 'OUA', name: 'Thomas Sankara International Airport', city: 'Ouagadougou', country: 'BF' },
  { code: 'BKO', name: 'Bamako-Sénou International Airport', city: 'Bamako', country: 'ML' },
  { code: 'NIM', name: 'Niamey Diori Hamani International Airport', city: 'Niamey', country: 'NE' },
  { code: 'LFW', name: 'Lomé-Tokoin International Airport', city: 'Lomé', country: 'TG' },
  { code: 'COO', name: 'Cadjehoun Airport', city: 'Cotonou', country: 'BJ' },
  { code: 'LBV', name: 'Libreville International Airport', city: 'Libreville', country: 'GA' },
  { code: 'DLA', name: 'Douala International Airport', city: 'Douala', country: 'CM' },
  { code: 'NSI', name: 'Yaoundé Nsimalen International Airport', city: 'Yaoundé', country: 'CM' },
  { code: 'BGF', name: 'Bangui M\'Poko International Airport', city: 'Bangui', country: 'CF' },
  { code: 'NDJ', name: 'Hassan Djamous International Airport', city: "N'Djamena", country: 'TD' },
  { code: 'BZV', name: 'Maya-Maya Airport', city: 'Brazzaville', country: 'CG' },
  { code: 'FIH', name: 'Kinshasa N\'Djili International Airport', city: 'Kinshasa', country: 'CD' },
  { code: 'CAI', name: 'Cairo International Airport', city: 'Cairo', country: 'EG' },
  { code: 'HBE', name: 'Alexandria Borg El Arab Airport', city: 'Alexandria', country: 'EG' },
  { code: 'LXR', name: 'Luxor International Airport', city: 'Luxor', country: 'EG' },
  { code: 'SSH', name: 'Sharm El Sheikh International Airport', city: 'Sharm El Sheikh', country: 'EG' },
  { code: 'HRG', name: 'Hurghada International Airport', city: 'Hurghada', country: 'EG' },
  { code: 'CMN', name: 'Mohammed V International Airport', city: 'Casablanca', country: 'MA' },
  { code: 'RAK', name: 'Marrakech Menara Airport', city: 'Marrakech', country: 'MA' },
  { code: 'FEZ', name: 'Fès–Saïss Airport', city: 'Fez', country: 'MA' },
  { code: 'AGA', name: 'Al Massira Airport', city: 'Agadir', country: 'MA' },
  { code: 'TNG', name: 'Ibn Batouta Airport', city: 'Tangier', country: 'MA' },
  { code: 'ALG', name: 'Houari Boumediene Airport', city: 'Algiers', country: 'DZ' },
  { code: 'ORN', name: 'Ahmed Ben Bella Airport', city: 'Oran', country: 'DZ' },
  { code: 'TUN', name: 'Tunis-Carthage International Airport', city: 'Tunis', country: 'TN' },
  { code: 'SFA', name: 'Sfax-Thyna International Airport', city: 'Sfax', country: 'TN' },
  { code: 'MIR', name: 'Monastir Habib Bourguiba International Airport', city: 'Monastir', country: 'TN' },
  { code: 'TIP', name: 'Tripoli International Airport', city: 'Tripoli', country: 'LY' },

  // ── Middle East ──────────────────────────────────────────────────────────────
  { code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'AE' },
  { code: 'DWC', name: 'Al Maktoum International Airport', city: 'Dubai', country: 'AE' },
  { code: 'AUH', name: 'Zayed International Airport', city: 'Abu Dhabi', country: 'AE' },
  { code: 'SHJ', name: 'Sharjah International Airport', city: 'Sharjah', country: 'AE' },
  { code: 'DOH', name: 'Hamad International Airport', city: 'Doha', country: 'QA' },
  { code: 'BAH', name: 'Bahrain International Airport', city: 'Manama', country: 'BH' },
  { code: 'KWI', name: 'Kuwait International Airport', city: 'Kuwait City', country: 'KW' },
  { code: 'MCT', name: 'Muscat International Airport', city: 'Muscat', country: 'OM' },
  { code: 'SLL', name: 'Salalah Airport', city: 'Salalah', country: 'OM' },
  { code: 'JED', name: 'King Abdulaziz International Airport', city: 'Jeddah', country: 'SA' },
  { code: 'RUH', name: 'King Khalid International Airport', city: 'Riyadh', country: 'SA' },
  { code: 'DMM', name: 'King Fahd International Airport', city: 'Dammam', country: 'SA' },
  { code: 'MED', name: 'Prince Mohammad Bin Abdulaziz Airport', city: 'Medina', country: 'SA' },
  { code: 'TIF', name: 'Taif Regional Airport', city: 'Taif', country: 'SA' },
  { code: 'AHB', name: 'Abha Regional Airport', city: 'Abha', country: 'SA' },
  { code: 'BGW', name: 'Baghdad International Airport', city: 'Baghdad', country: 'IQ' },
  { code: 'BSR', name: 'Basra International Airport', city: 'Basra', country: 'IQ' },
  { code: 'EBL', name: 'Erbil International Airport', city: 'Erbil', country: 'IQ' },
  { code: 'BEY', name: 'Rafic Hariri International Airport', city: 'Beirut', country: 'LB' },
  { code: 'DAM', name: 'Damascus International Airport', city: 'Damascus', country: 'SY' },
  { code: 'AMM', name: 'Queen Alia International Airport', city: 'Amman', country: 'JO' },
  { code: 'AQJ', name: 'King Hussein International Airport', city: 'Aqaba', country: 'JO' },
  { code: 'TLV', name: 'Ben Gurion International Airport', city: 'Tel Aviv', country: 'IL' },
  { code: 'SAH', name: 'Sana\'a International Airport', city: "Sana'a", country: 'YE' },
  { code: 'IKA', name: 'Imam Khomeini International Airport', city: 'Tehran', country: 'IR' },
  { code: 'THR', name: 'Mehrabad International Airport', city: 'Tehran', country: 'IR' },
  { code: 'MHD', name: 'Mashhad International Airport', city: 'Mashhad', country: 'IR' },
  { code: 'ISF', name: 'Isfahan International Airport', city: 'Isfahan', country: 'IR' },
  { code: 'SYZ', name: 'Shiraz International Airport', city: 'Shiraz', country: 'IR' },

  // ── Turkey ───────────────────────────────────────────────────────────────────
  { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'TR' },
  { code: 'SAW', name: 'Sabiha Gökçen International Airport', city: 'Istanbul', country: 'TR' },
  { code: 'ADB', name: 'Adnan Menderes Airport', city: 'Izmir', country: 'TR' },
  { code: 'ESB', name: 'Ankara Esenboğa Airport', city: 'Ankara', country: 'TR' },
  { code: 'AYT', name: 'Antalya International Airport', city: 'Antalya', country: 'TR' },
  { code: 'DLM', name: 'Dalaman Airport', city: 'Dalaman', country: 'TR' },
  { code: 'BJV', name: 'Milas–Bodrum Airport', city: 'Bodrum', country: 'TR' },
  { code: 'TZX', name: 'Trabzon Airport', city: 'Trabzon', country: 'TR' },

  // ── Western Europe ────────────────────────────────────────────────────────────
  { code: 'LHR', name: 'Heathrow Airport', city: 'London', country: 'GB' },
  { code: 'LGW', name: 'Gatwick Airport', city: 'London', country: 'GB' },
  { code: 'STN', name: 'Stansted Airport', city: 'London', country: 'GB' },
  { code: 'LTN', name: 'Luton Airport', city: 'London', country: 'GB' },
  { code: 'LCY', name: 'London City Airport', city: 'London', country: 'GB' },
  { code: 'MAN', name: 'Manchester Airport', city: 'Manchester', country: 'GB' },
  { code: 'BHX', name: 'Birmingham Airport', city: 'Birmingham', country: 'GB' },
  { code: 'EDI', name: 'Edinburgh Airport', city: 'Edinburgh', country: 'GB' },
  { code: 'GLA', name: 'Glasgow International Airport', city: 'Glasgow', country: 'GB' },
  { code: 'BRS', name: 'Bristol Airport', city: 'Bristol', country: 'GB' },
  { code: 'NCL', name: 'Newcastle Airport', city: 'Newcastle', country: 'GB' },
  { code: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'FR' },
  { code: 'ORY', name: 'Orly Airport', city: 'Paris', country: 'FR' },
  { code: 'NCE', name: 'Nice Côte d\'Azur Airport', city: 'Nice', country: 'FR' },
  { code: 'LYS', name: 'Lyon–Saint Exupéry Airport', city: 'Lyon', country: 'FR' },
  { code: 'MRS', name: 'Marseille Provence Airport', city: 'Marseille', country: 'FR' },
  { code: 'TLS', name: 'Toulouse–Blagnac Airport', city: 'Toulouse', country: 'FR' },
  { code: 'BOD', name: 'Bordeaux–Mérignac Airport', city: 'Bordeaux', country: 'FR' },
  { code: 'AMS', name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', country: 'NL' },
  { code: 'EIN', name: 'Eindhoven Airport', city: 'Eindhoven', country: 'NL' },
  { code: 'RTM', name: 'Rotterdam The Hague Airport', city: 'Rotterdam', country: 'NL' },
  { code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'DE' },
  { code: 'MUC', name: 'Munich Airport', city: 'Munich', country: 'DE' },
  { code: 'DUS', name: 'Düsseldorf Airport', city: 'Düsseldorf', country: 'DE' },
  { code: 'BER', name: 'Berlin Brandenburg Airport', city: 'Berlin', country: 'DE' },
  { code: 'HAM', name: 'Hamburg Airport', city: 'Hamburg', country: 'DE' },
  { code: 'STR', name: 'Stuttgart Airport', city: 'Stuttgart', country: 'DE' },
  { code: 'CGN', name: 'Cologne Bonn Airport', city: 'Cologne', country: 'DE' },
  { code: 'NUE', name: 'Nuremberg Airport', city: 'Nuremberg', country: 'DE' },
  { code: 'HAJ', name: 'Hanover Airport', city: 'Hanover', country: 'DE' },
  { code: 'FCO', name: 'Leonardo da Vinci International Airport', city: 'Rome', country: 'IT' },
  { code: 'MXP', name: 'Milan Malpensa Airport', city: 'Milan', country: 'IT' },
  { code: 'LIN', name: 'Milan Linate Airport', city: 'Milan', country: 'IT' },
  { code: 'BGY', name: 'Orio al Serio International Airport', city: 'Bergamo', country: 'IT' },
  { code: 'VCE', name: 'Venice Marco Polo Airport', city: 'Venice', country: 'IT' },
  { code: 'BLQ', name: 'Bologna Guglielmo Marconi Airport', city: 'Bologna', country: 'IT' },
  { code: 'NAP', name: 'Naples International Airport', city: 'Naples', country: 'IT' },
  { code: 'PMO', name: 'Falcone–Borsellino Airport', city: 'Palermo', country: 'IT' },
  { code: 'CTA', name: 'Catania–Fontanarossa Airport', city: 'Catania', country: 'IT' },
  { code: 'MAD', name: 'Adolfo Suárez Madrid–Barajas Airport', city: 'Madrid', country: 'ES' },
  { code: 'BCN', name: 'Barcelona–El Prat Airport', city: 'Barcelona', country: 'ES' },
  { code: 'PMI', name: 'Palma de Mallorca Airport', city: 'Palma', country: 'ES' },
  { code: 'AGP', name: 'Málaga–Costa del Sol Airport', city: 'Málaga', country: 'ES' },
  { code: 'ALC', name: 'Alicante–Elche Airport', city: 'Alicante', country: 'ES' },
  { code: 'SVQ', name: 'Seville Airport', city: 'Seville', country: 'ES' },
  { code: 'BIO', name: 'Bilbao Airport', city: 'Bilbao', country: 'ES' },
  { code: 'VLC', name: 'Valencia Airport', city: 'Valencia', country: 'ES' },
  { code: 'LPA', name: 'Gran Canaria Airport', city: 'Las Palmas', country: 'ES' },
  { code: 'TFN', name: 'Tenerife North Airport', city: 'Tenerife', country: 'ES' },
  { code: 'TFS', name: 'Tenerife South Airport', city: 'Tenerife', country: 'ES' },
  { code: 'ZRH', name: 'Zurich Airport', city: 'Zurich', country: 'CH' },
  { code: 'GVA', name: 'Geneva Airport', city: 'Geneva', country: 'CH' },
  { code: 'BSL', name: 'EuroAirport Basel–Mulhouse–Freiburg', city: 'Basel', country: 'CH' },
  { code: 'BRU', name: 'Brussels Airport', city: 'Brussels', country: 'BE' },
  { code: 'CRL', name: 'Brussels South Charleroi Airport', city: 'Charleroi', country: 'BE' },
  { code: 'LIS', name: 'Lisbon Humberto Delgado Airport', city: 'Lisbon', country: 'PT' },
  { code: 'OPO', name: 'Francisco Sá Carneiro Airport', city: 'Porto', country: 'PT' },
  { code: 'FAO', name: 'Faro Airport', city: 'Faro', country: 'PT' },
  { code: 'VIE', name: 'Vienna International Airport', city: 'Vienna', country: 'AT' },
  { code: 'GRZ', name: 'Graz Airport', city: 'Graz', country: 'AT' },
  { code: 'SZG', name: 'Salzburg Airport', city: 'Salzburg', country: 'AT' },
  { code: 'PRG', name: 'Václav Havel Airport Prague', city: 'Prague', country: 'CZ' },
  { code: 'BRQ', name: 'Brno–Tuřany Airport', city: 'Brno', country: 'CZ' },
  { code: 'BUD', name: 'Budapest Ferenc Liszt Airport', city: 'Budapest', country: 'HU' },
  { code: 'WAW', name: 'Warsaw Chopin Airport', city: 'Warsaw', country: 'PL' },
  { code: 'KRK', name: 'John Paul II Kraków–Balice International Airport', city: 'Kraków', country: 'PL' },
  { code: 'GDN', name: 'Gdańsk Lech Wałęsa Airport', city: 'Gdańsk', country: 'PL' },
  { code: 'WRO', name: 'Copernicus Airport Wrocław', city: 'Wrocław', country: 'PL' },
  { code: 'ARN', name: 'Stockholm Arlanda Airport', city: 'Stockholm', country: 'SE' },
  { code: 'GOT', name: 'Göteborg Landvetter Airport', city: 'Gothenburg', country: 'SE' },
  { code: 'MMX', name: 'Malmö Airport', city: 'Malmö', country: 'SE' },
  { code: 'OSL', name: 'Oslo Gardermoen Airport', city: 'Oslo', country: 'NO' },
  { code: 'BGO', name: 'Bergen Airport Flesland', city: 'Bergen', country: 'NO' },
  { code: 'TRD', name: 'Trondheim Airport Værnes', city: 'Trondheim', country: 'NO' },
  { code: 'CPH', name: 'Copenhagen Airport', city: 'Copenhagen', country: 'DK' },
  { code: 'AAL', name: 'Aalborg Airport', city: 'Aalborg', country: 'DK' },
  { code: 'HEL', name: 'Helsinki-Vantaa Airport', city: 'Helsinki', country: 'FI' },
  { code: 'TMP', name: 'Tampere–Pirkkala Airport', city: 'Tampere', country: 'FI' },
  { code: 'RVN', name: 'Rovaniemi Airport', city: 'Rovaniemi', country: 'FI' },
  { code: 'DUB', name: 'Dublin Airport', city: 'Dublin', country: 'IE' },
  { code: 'ORK', name: 'Cork Airport', city: 'Cork', country: 'IE' },
  { code: 'SNN', name: 'Shannon Airport', city: 'Shannon', country: 'IE' },
  { code: 'ATH', name: 'Athens International Airport', city: 'Athens', country: 'GR' },
  { code: 'SKG', name: 'Thessaloniki International Airport', city: 'Thessaloniki', country: 'GR' },
  { code: 'HER', name: 'Heraklion International Airport', city: 'Heraklion', country: 'GR' },
  { code: 'RHO', name: 'Rhodes International Airport', city: 'Rhodes', country: 'GR' },
  { code: 'CFU', name: 'Corfu International Airport', city: 'Corfu', country: 'GR' },
  { code: 'LCA', name: 'Larnaca International Airport', city: 'Larnaca', country: 'CY' },
  { code: 'PFO', name: 'Paphos International Airport', city: 'Paphos', country: 'CY' },

  // ── Eastern Europe ───────────────────────────────────────────────────────────
  { code: 'SVO', name: 'Sheremetyevo International Airport', city: 'Moscow', country: 'RU' },
  { code: 'DME', name: 'Domodedovo International Airport', city: 'Moscow', country: 'RU' },
  { code: 'VKO', name: 'Vnukovo International Airport', city: 'Moscow', country: 'RU' },
  { code: 'LED', name: 'Pulkovo Airport', city: 'Saint Petersburg', country: 'RU' },
  { code: 'OVB', name: 'Tolmachevo Airport', city: 'Novosibirsk', country: 'RU' },
  { code: 'SVX', name: 'Koltsovo Airport', city: 'Yekaterinburg', country: 'RU' },
  { code: 'KZN', name: 'Kazan International Airport', city: 'Kazan', country: 'RU' },
  { code: 'SIP', name: 'Simferopol International Airport', city: 'Simferopol', country: 'UA' },
  { code: 'KBP', name: 'Boryspil International Airport', city: 'Kyiv', country: 'UA' },
  { code: 'IEV', name: 'Kyiv Sikorsky International Airport', city: 'Kyiv', country: 'UA' },
  { code: 'LWO', name: 'Lviv Danylo Halytskyi International Airport', city: 'Lviv', country: 'UA' },
  { code: 'ODS', name: 'Odessa International Airport', city: 'Odessa', country: 'UA' },
  { code: 'MSQ', name: 'Minsk National Airport', city: 'Minsk', country: 'BY' },
  { code: 'RIX', name: 'Riga International Airport', city: 'Riga', country: 'LV' },
  { code: 'TLL', name: 'Tallinn Airport', city: 'Tallinn', country: 'EE' },
  { code: 'VNO', name: 'Vilnius International Airport', city: 'Vilnius', country: 'LT' },
  { code: 'OTP', name: 'Henri Coandă International Airport', city: 'Bucharest', country: 'RO' },
  { code: 'CLJ', name: 'Cluj-Napoca International Airport', city: 'Cluj-Napoca', country: 'RO' },
  { code: 'SOF', name: 'Sofia Airport', city: 'Sofia', country: 'BG' },
  { code: 'BEG', name: 'Belgrade Nikola Tesla Airport', city: 'Belgrade', country: 'RS' },
  { code: 'ZAG', name: 'Zagreb Airport', city: 'Zagreb', country: 'HR' },
  { code: 'SPU', name: 'Split Airport', city: 'Split', country: 'HR' },
  { code: 'DBV', name: 'Dubrovnik Airport', city: 'Dubrovnik', country: 'HR' },
  { code: 'LJU', name: 'Ljubljana Jože Pučnik Airport', city: 'Ljubljana', country: 'SI' },
  { code: 'SKP', name: 'Skopje International Airport', city: 'Skopje', country: 'MK' },
  { code: 'TIA', name: 'Tirana International Airport', city: 'Tirana', country: 'AL' },
  { code: 'POD', name: 'Podgorica Airport', city: 'Podgorica', country: 'ME' },

  // ── Central Asia ────────────────────────────────────────────────────────────
  { code: 'ALA', name: 'Almaty International Airport', city: 'Almaty', country: 'KZ' },
  { code: 'NQZ', name: 'Nursultan Nazarbayev International Airport', city: 'Astana', country: 'KZ' },
  { code: 'TAS', name: 'Islam Karimov Tashkent International Airport', city: 'Tashkent', country: 'UZ' },
  { code: 'SZG', name: 'Samarkand International Airport', city: 'Samarkand', country: 'UZ' },
  { code: 'FRU', name: 'Manas International Airport', city: 'Bishkek', country: 'KG' },
  { code: 'ASB', name: 'Ashgabat International Airport', city: 'Ashgabat', country: 'TM' },
  { code: 'DYU', name: 'Dushanbe Airport', city: 'Dushanbe', country: 'TJ' },
  { code: 'KBL', name: 'Kabul Hamid Karzai International Airport', city: 'Kabul', country: 'AF' },

  // ── South Asia ───────────────────────────────────────────────────────────────
  { code: 'DEL', name: 'Indira Gandhi International Airport', city: 'New Delhi', country: 'IN' },
  { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', country: 'IN' },
  { code: 'BLR', name: 'Kempegowda International Airport', city: 'Bengaluru', country: 'IN' },
  { code: 'MAA', name: 'Chennai International Airport', city: 'Chennai', country: 'IN' },
  { code: 'HYD', name: 'Rajiv Gandhi International Airport', city: 'Hyderabad', country: 'IN' },
  { code: 'CCU', name: 'Netaji Subhas Chandra Bose International Airport', city: 'Kolkata', country: 'IN' },
  { code: 'COK', name: 'Cochin International Airport', city: 'Kochi', country: 'IN' },
  { code: 'AMD', name: 'Sardar Vallabhbhai Patel International Airport', city: 'Ahmedabad', country: 'IN' },
  { code: 'PNQ', name: 'Pune Airport', city: 'Pune', country: 'IN' },
  { code: 'GOI', name: 'Goa International Airport', city: 'Goa', country: 'IN' },
  { code: 'JAI', name: 'Jaipur International Airport', city: 'Jaipur', country: 'IN' },
  { code: 'LKO', name: 'Chaudhary Charan Singh International Airport', city: 'Lucknow', country: 'IN' },
  { code: 'PAT', name: 'Jay Prakash Narayan International Airport', city: 'Patna', country: 'IN' },
  { code: 'VNS', name: 'Varanasi Airport', city: 'Varanasi', country: 'IN' },
  { code: 'IXC', name: 'Chandigarh Airport', city: 'Chandigarh', country: 'IN' },
  { code: 'ATQ', name: 'Sri Guru Ram Dass Jee International Airport', city: 'Amritsar', country: 'IN' },
  { code: 'TRV', name: 'Trivandrum International Airport', city: 'Thiruvananthapuram', country: 'IN' },
  { code: 'KNU', name: 'Kanpur Airport', city: 'Kanpur', country: 'IN' },
  { code: 'KTM', name: 'Tribhuvan International Airport', city: 'Kathmandu', country: 'NP' },
  { code: 'CMB', name: 'Bandaranaike International Airport', city: 'Colombo', country: 'LK' },
  { code: 'DAC', name: 'Hazrat Shahjalal International Airport', city: 'Dhaka', country: 'BD' },
  { code: 'CGP', name: 'Shah Amanat International Airport', city: 'Chittagong', country: 'BD' },
  { code: 'KHI', name: 'Jinnah International Airport', city: 'Karachi', country: 'PK' },
  { code: 'LHE', name: 'Allama Iqbal International Airport', city: 'Lahore', country: 'PK' },
  { code: 'ISB', name: 'Islamabad International Airport', city: 'Islamabad', country: 'PK' },
  { code: 'PEW', name: 'Bacha Khan International Airport', city: 'Peshawar', country: 'PK' },
  { code: 'MLE', name: 'Velana International Airport', city: 'Male', country: 'MV' },

  // ── Southeast Asia ───────────────────────────────────────────────────────────
  { code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', country: 'SG' },
  { code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'TH' },
  { code: 'DMK', name: 'Don Mueang International Airport', city: 'Bangkok', country: 'TH' },
  { code: 'HKT', name: 'Phuket International Airport', city: 'Phuket', country: 'TH' },
  { code: 'CNX', name: 'Chiang Mai International Airport', city: 'Chiang Mai', country: 'TH' },
  { code: 'USM', name: 'Samui Airport', city: 'Koh Samui', country: 'TH' },
  { code: 'KUL', name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country: 'MY' },
  { code: 'KUL', name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country: 'MY' },
  { code: 'SZB', name: 'Sultan Abdul Aziz Shah Airport', city: 'Subang', country: 'MY' },
  { code: 'PEN', name: 'Penang International Airport', city: 'Penang', country: 'MY' },
  { code: 'JHB', name: 'Senai International Airport', city: 'Johor Bahru', country: 'MY' },
  { code: 'BKI', name: 'Kota Kinabalu International Airport', city: 'Kota Kinabalu', country: 'MY' },
  { code: 'KCH', name: 'Kuching International Airport', city: 'Kuching', country: 'MY' },
  { code: 'CGK', name: 'Soekarno-Hatta International Airport', city: 'Jakarta', country: 'ID' },
  { code: 'DPS', name: 'Ngurah Rai International Airport', city: 'Bali', country: 'ID' },
  { code: 'SUB', name: 'Juanda International Airport', city: 'Surabaya', country: 'ID' },
  { code: 'UPG', name: 'Sultan Hasanuddin International Airport', city: 'Makassar', country: 'ID' },
  { code: 'MNL', name: 'Ninoy Aquino International Airport', city: 'Manila', country: 'PH' },
  { code: 'CEB', name: 'Mactan-Cebu International Airport', city: 'Cebu', country: 'PH' },
  { code: 'DVO', name: 'Francisco Bangoy International Airport', city: 'Davao', country: 'PH' },
  { code: 'SGN', name: 'Tan Son Nhat International Airport', city: 'Ho Chi Minh City', country: 'VN' },
  { code: 'HAN', name: 'Noi Bai International Airport', city: 'Hanoi', country: 'VN' },
  { code: 'DAD', name: 'Da Nang International Airport', city: 'Da Nang', country: 'VN' },
  { code: 'PNH', name: 'Phnom Penh International Airport', city: 'Phnom Penh', country: 'KH' },
  { code: 'REP', name: 'Siem Reap International Airport', city: 'Siem Reap', country: 'KH' },
  { code: 'VTE', name: 'Wattay International Airport', city: 'Vientiane', country: 'LA' },
  { code: 'RGN', name: 'Yangon International Airport', city: 'Yangon', country: 'MM' },
  { code: 'MDL', name: 'Mandalay International Airport', city: 'Mandalay', country: 'MM' },
  { code: 'BWN', name: 'Brunei International Airport', city: 'Bandar Seri Begawan', country: 'BN' },

  // ── East Asia ────────────────────────────────────────────────────────────────
  { code: 'HND', name: 'Tokyo Haneda Airport', city: 'Tokyo', country: 'JP' },
  { code: 'NRT', name: 'Narita International Airport', city: 'Tokyo', country: 'JP' },
  { code: 'KIX', name: 'Kansai International Airport', city: 'Osaka', country: 'JP' },
  { code: 'ITM', name: 'Osaka Itami Airport', city: 'Osaka', country: 'JP' },
  { code: 'NGO', name: 'Chubu Centrair International Airport', city: 'Nagoya', country: 'JP' },
  { code: 'FUK', name: 'Fukuoka Airport', city: 'Fukuoka', country: 'JP' },
  { code: 'CTS', name: 'New Chitose Airport', city: 'Sapporo', country: 'JP' },
  { code: 'OKA', name: 'Naha Airport', city: 'Okinawa', country: 'JP' },
  { code: 'ICN', name: 'Incheon International Airport', city: 'Seoul', country: 'KR' },
  { code: 'GMP', name: 'Gimpo International Airport', city: 'Seoul', country: 'KR' },
  { code: 'PUS', name: 'Gimhae International Airport', city: 'Busan', country: 'KR' },
  { code: 'CJU', name: 'Jeju International Airport', city: 'Jeju', country: 'KR' },
  { code: 'PEK', name: 'Beijing Capital International Airport', city: 'Beijing', country: 'CN' },
  { code: 'PKX', name: 'Beijing Daxing International Airport', city: 'Beijing', country: 'CN' },
  { code: 'PVG', name: 'Shanghai Pudong International Airport', city: 'Shanghai', country: 'CN' },
  { code: 'SHA', name: 'Shanghai Hongqiao International Airport', city: 'Shanghai', country: 'CN' },
  { code: 'CAN', name: 'Guangzhou Baiyun International Airport', city: 'Guangzhou', country: 'CN' },
  { code: 'SZX', name: 'Shenzhen Bao\'an International Airport', city: 'Shenzhen', country: 'CN' },
  { code: 'CTU', name: 'Chengdu Tianfu International Airport', city: 'Chengdu', country: 'CN' },
  { code: 'WUH', name: 'Wuhan Tianhe International Airport', city: 'Wuhan', country: 'CN' },
  { code: 'KMG', name: 'Kunming Changshui International Airport', city: 'Kunming', country: 'CN' },
  { code: 'XIY', name: 'Xi\'an Xianyang International Airport', city: "Xi'an", country: 'CN' },
  { code: 'TSN', name: 'Tianjin Binhai International Airport', city: 'Tianjin', country: 'CN' },
  { code: 'HGH', name: 'Hangzhou Xiaoshan International Airport', city: 'Hangzhou', country: 'CN' },
  { code: 'CSX', name: 'Changsha Huanghua International Airport', city: 'Changsha', country: 'CN' },
  { code: 'NKG', name: 'Nanjing Lukou International Airport', city: 'Nanjing', country: 'CN' },
  { code: 'CKG', name: 'Chongqing Jiangbei International Airport', city: 'Chongqing', country: 'CN' },
  { code: 'HKG', name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'HK' },
  { code: 'MFM', name: 'Macau International Airport', city: 'Macau', country: 'MO' },
  { code: 'TPE', name: 'Taiwan Taoyuan International Airport', city: 'Taipei', country: 'TW' },
  { code: 'TSA', name: 'Taipei Songshan Airport', city: 'Taipei', country: 'TW' },
  { code: 'ULN', name: 'Chinggis Khaan International Airport', city: 'Ulaanbaatar', country: 'MN' },

  // ── North America ─────────────────────────────────────────────────────────────
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'US' },
  { code: 'LGA', name: 'LaGuardia Airport', city: 'New York', country: 'US' },
  { code: 'EWR', name: 'Newark Liberty International Airport', city: 'New York', country: 'US' },
  { code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'US' },
  { code: 'BUR', name: 'Hollywood Burbank Airport', city: 'Burbank', country: 'US' },
  { code: 'LGB', name: 'Long Beach Airport', city: 'Long Beach', country: 'US' },
  { code: 'SNA', name: 'John Wayne Airport', city: 'Orange County', country: 'US' },
  { code: 'ONT', name: 'Ontario International Airport', city: 'Ontario', country: 'US' },
  { code: 'ORD', name: "O'Hare International Airport", city: 'Chicago', country: 'US' },
  { code: 'MDW', name: 'Chicago Midway International Airport', city: 'Chicago', country: 'US' },
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', country: 'US' },
  { code: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', country: 'US' },
  { code: 'OAK', name: 'Oakland International Airport', city: 'Oakland', country: 'US' },
  { code: 'SJC', name: 'Norman Y. Mineta San José International Airport', city: 'San Jose', country: 'US' },
  { code: 'MIA', name: 'Miami International Airport', city: 'Miami', country: 'US' },
  { code: 'FLL', name: 'Fort Lauderdale–Hollywood International Airport', city: 'Fort Lauderdale', country: 'US' },
  { code: 'PBI', name: 'Palm Beach International Airport', city: 'West Palm Beach', country: 'US' },
  { code: 'MCO', name: 'Orlando International Airport', city: 'Orlando', country: 'US' },
  { code: 'TPA', name: 'Tampa International Airport', city: 'Tampa', country: 'US' },
  { code: 'IAD', name: 'Washington Dulles International Airport', city: 'Washington D.C.', country: 'US' },
  { code: 'DCA', name: 'Ronald Reagan Washington National Airport', city: 'Washington D.C.', country: 'US' },
  { code: 'BWI', name: 'Baltimore/Washington International Airport', city: 'Baltimore', country: 'US' },
  { code: 'BOS', name: 'Logan International Airport', city: 'Boston', country: 'US' },
  { code: 'PHL', name: 'Philadelphia International Airport', city: 'Philadelphia', country: 'US' },
  { code: 'CLT', name: 'Charlotte Douglas International Airport', city: 'Charlotte', country: 'US' },
  { code: 'MSP', name: 'Minneapolis-Saint Paul International Airport', city: 'Minneapolis', country: 'US' },
  { code: 'DTW', name: 'Detroit Metropolitan Wayne County Airport', city: 'Detroit', country: 'US' },
  { code: 'SEA', name: 'Seattle-Tacoma International Airport', city: 'Seattle', country: 'US' },
  { code: 'PDX', name: 'Portland International Airport', city: 'Portland', country: 'US' },
  { code: 'DEN', name: 'Denver International Airport', city: 'Denver', country: 'US' },
  { code: 'DFW', name: 'Dallas/Fort Worth International Airport', city: 'Dallas', country: 'US' },
  { code: 'DAL', name: 'Dallas Love Field', city: 'Dallas', country: 'US' },
  { code: 'IAH', name: 'George Bush Intercontinental Airport', city: 'Houston', country: 'US' },
  { code: 'HOU', name: 'William P. Hobby Airport', city: 'Houston', country: 'US' },
  { code: 'PHX', name: 'Phoenix Sky Harbor International Airport', city: 'Phoenix', country: 'US' },
  { code: 'LAS', name: 'Harry Reid International Airport', city: 'Las Vegas', country: 'US' },
  { code: 'SLC', name: 'Salt Lake City International Airport', city: 'Salt Lake City', country: 'US' },
  { code: 'SAN', name: 'San Diego International Airport', city: 'San Diego', country: 'US' },
  { code: 'MSY', name: 'Louis Armstrong New Orleans International Airport', city: 'New Orleans', country: 'US' },
  { code: 'MCI', name: 'Kansas City International Airport', city: 'Kansas City', country: 'US' },
  { code: 'STL', name: 'St. Louis Lambert International Airport', city: 'St. Louis', country: 'US' },
  { code: 'CVG', name: 'Cincinnati/Northern Kentucky International Airport', city: 'Cincinnati', country: 'US' },
  { code: 'CMH', name: 'John Glenn Columbus International Airport', city: 'Columbus', country: 'US' },
  { code: 'IND', name: 'Indianapolis International Airport', city: 'Indianapolis', country: 'US' },
  { code: 'MKE', name: 'Milwaukee Mitchell International Airport', city: 'Milwaukee', country: 'US' },
  { code: 'CLE', name: 'Cleveland Hopkins International Airport', city: 'Cleveland', country: 'US' },
  { code: 'PIT', name: 'Pittsburgh International Airport', city: 'Pittsburgh', country: 'US' },
  { code: 'BNA', name: 'Nashville International Airport', city: 'Nashville', country: 'US' },
  { code: 'MEM', name: 'Memphis International Airport', city: 'Memphis', country: 'US' },
  { code: 'BHM', name: 'Birmingham-Shuttlesworth International Airport', city: 'Birmingham', country: 'US' },
  { code: 'RDU', name: 'Raleigh-Durham International Airport', city: 'Raleigh', country: 'US' },
  { code: 'JAX', name: 'Jacksonville International Airport', city: 'Jacksonville', country: 'US' },
  { code: 'SAT', name: 'San Antonio International Airport', city: 'San Antonio', country: 'US' },
  { code: 'AUS', name: 'Austin-Bergstrom International Airport', city: 'Austin', country: 'US' },
  { code: 'MSN', name: 'Dane County Regional Airport', city: 'Madison', country: 'US' },
  { code: 'ABQ', name: 'Albuquerque International Sunport', city: 'Albuquerque', country: 'US' },
  { code: 'TUS', name: 'Tucson International Airport', city: 'Tucson', country: 'US' },
  { code: 'GEG', name: 'Spokane International Airport', city: 'Spokane', country: 'US' },
  { code: 'FAT', name: 'Fresno Yosemite International Airport', city: 'Fresno', country: 'US' },
  { code: 'SMF', name: 'Sacramento International Airport', city: 'Sacramento', country: 'US' },
  { code: 'ANC', name: 'Ted Stevens Anchorage International Airport', city: 'Anchorage', country: 'US' },
  { code: 'HNL', name: 'Daniel K. Inouye International Airport', city: 'Honolulu', country: 'US' },
  { code: 'OGG', name: 'Kahului Airport', city: 'Maui', country: 'US' },
  { code: 'KOA', name: 'Ellison Onizuka Kona International Airport', city: 'Kona', country: 'US' },
  { code: 'LIH', name: 'Lihue Airport', city: 'Kauai', country: 'US' },
  { code: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto', country: 'CA' },
  { code: 'YYC', name: 'Calgary International Airport', city: 'Calgary', country: 'CA' },
  { code: 'YVR', name: 'Vancouver International Airport', city: 'Vancouver', country: 'CA' },
  { code: 'YUL', name: 'Montréal–Trudeau International Airport', city: 'Montreal', country: 'CA' },
  { code: 'YOW', name: 'Ottawa Macdonald–Cartier International Airport', city: 'Ottawa', country: 'CA' },
  { code: 'YEG', name: 'Edmonton International Airport', city: 'Edmonton', country: 'CA' },
  { code: 'YWG', name: 'Winnipeg James Armstrong Richardson International Airport', city: 'Winnipeg', country: 'CA' },
  { code: 'YHZ', name: 'Halifax Stanfield International Airport', city: 'Halifax', country: 'CA' },
  { code: 'YQB', name: 'Québec City Jean Lesage International Airport', city: 'Quebec City', country: 'CA' },
  { code: 'MEX', name: 'Mexico City International Airport', city: 'Mexico City', country: 'MX' },
  { code: 'NLU', name: 'Felipe Ángeles International Airport', city: 'Mexico City', country: 'MX' },
  { code: 'GDL', name: 'Don Miguel Hidalgo y Costilla International Airport', city: 'Guadalajara', country: 'MX' },
  { code: 'MTY', name: 'General Mariano Escobedo International Airport', city: 'Monterrey', country: 'MX' },
  { code: 'CUN', name: 'Cancún International Airport', city: 'Cancún', country: 'MX' },
  { code: 'SJD', name: 'Los Cabos International Airport', city: 'Los Cabos', country: 'MX' },
  { code: 'PVR', name: 'Licenciado Gustavo Díaz Ordaz International Airport', city: 'Puerto Vallarta', country: 'MX' },
  { code: 'TIJ', name: 'General Abelardo L. Rodríguez International Airport', city: 'Tijuana', country: 'MX' },

  // ── Caribbean & Central America ───────────────────────────────────────────────
  { code: 'HAV', name: 'José Martí International Airport', city: 'Havana', country: 'CU' },
  { code: 'NAS', name: 'Lynden Pindling International Airport', city: 'Nassau', country: 'BS' },
  { code: 'MBJ', name: 'Sangster International Airport', city: 'Montego Bay', country: 'JM' },
  { code: 'KIN', name: 'Norman Manley International Airport', city: 'Kingston', country: 'JM' },
  { code: 'SDQ', name: 'Las Américas International Airport', city: 'Santo Domingo', country: 'DO' },
  { code: 'PUJ', name: 'Punta Cana International Airport', city: 'Punta Cana', country: 'DO' },
  { code: 'SJU', name: 'Luis Muñoz Marín International Airport', city: 'San Juan', country: 'PR' },
  { code: 'BON', name: 'Flamingo International Airport', city: 'Bonaire', country: 'BQ' },
  { code: 'SXM', name: 'Princess Juliana International Airport', city: 'Sint Maarten', country: 'SX' },
  { code: 'ANU', name: 'V.C. Bird International Airport', city: "Saint John's", country: 'AG' },
  { code: 'BGI', name: 'Grantley Adams International Airport', city: 'Bridgetown', country: 'BB' },
  { code: 'POS', name: 'Piarco International Airport', city: 'Port of Spain', country: 'TT' },
  { code: 'GEO', name: 'Cheddi Jagan International Airport', city: 'Georgetown', country: 'GY' },
  { code: 'SAL', name: 'Óscar Arnulfo Romero International Airport', city: 'San Salvador', country: 'SV' },
  { code: 'GUA', name: 'La Aurora International Airport', city: 'Guatemala City', country: 'GT' },
  { code: 'MGA', name: 'Augusto C. Sandino International Airport', city: 'Managua', country: 'NI' },
  { code: 'SJO', name: 'Juan Santamaría International Airport', city: 'San José', country: 'CR' },
  { code: 'PTY', name: 'Tocumen International Airport', city: 'Panama City', country: 'PA' },

  // ── South America ─────────────────────────────────────────────────────────────
  { code: 'GRU', name: 'São Paulo/Guarulhos International Airport', city: 'São Paulo', country: 'BR' },
  { code: 'CGH', name: 'Congonhas Airport', city: 'São Paulo', country: 'BR' },
  { code: 'GIG', name: 'Rio de Janeiro–Galeão International Airport', city: 'Rio de Janeiro', country: 'BR' },
  { code: 'SDU', name: 'Santos Dumont Airport', city: 'Rio de Janeiro', country: 'BR' },
  { code: 'BSB', name: 'Presidente Juscelino Kubitschek International Airport', city: 'Brasília', country: 'BR' },
  { code: 'CNF', name: 'Tancredo Neves International Airport', city: 'Belo Horizonte', country: 'BR' },
  { code: 'SSA', name: 'Luís Eduardo Magalhães International Airport', city: 'Salvador', country: 'BR' },
  { code: 'REC', name: 'Recife/Guararapes International Airport', city: 'Recife', country: 'BR' },
  { code: 'FOR', name: 'Pinto Martins International Airport', city: 'Fortaleza', country: 'BR' },
  { code: 'POA', name: 'Salgado Filho International Airport', city: 'Porto Alegre', country: 'BR' },
  { code: 'CWB', name: 'Afonso Pena International Airport', city: 'Curitiba', country: 'BR' },
  { code: 'MAO', name: 'Eduardo Gomes International Airport', city: 'Manaus', country: 'BR' },
  { code: 'BEL', name: 'Val de Cans International Airport', city: 'Belém', country: 'BR' },
  { code: 'EZE', name: 'Ministro Pistarini International Airport', city: 'Buenos Aires', country: 'AR' },
  { code: 'AEP', name: 'Aeroparque Jorge Newbery', city: 'Buenos Aires', country: 'AR' },
  { code: 'COR', name: 'Ingeniero Aeronáutico Ambrosio L.V. Taravella Airport', city: 'Córdoba', country: 'AR' },
  { code: 'MDZ', name: 'El Plumerillo Airport', city: 'Mendoza', country: 'AR' },
  { code: 'SCL', name: 'Arturo Merino Benítez International Airport', city: 'Santiago', country: 'CL' },
  { code: 'LIM', name: 'Jorge Chávez International Airport', city: 'Lima', country: 'PE' },
  { code: 'CUZ', name: 'Alejandro Velasco Astete International Airport', city: 'Cusco', country: 'PE' },
  { code: 'BOG', name: 'El Dorado International Airport', city: 'Bogotá', country: 'CO' },
  { code: 'MDE', name: 'José María Córdova International Airport', city: 'Medellín', country: 'CO' },
  { code: 'CLO', name: 'Alfonso Bonilla Aragón International Airport', city: 'Cali', country: 'CO' },
  { code: 'CTG', name: 'Rafael Núñez International Airport', city: 'Cartagena', country: 'CO' },
  { code: 'CCS', name: 'Simón Bolívar International Airport', city: 'Caracas', country: 'VE' },
  { code: 'UIO', name: 'Mariscal Sucre International Airport', city: 'Quito', country: 'EC' },
  { code: 'GYE', name: 'José Joaquín de Olmedo International Airport', city: 'Guayaquil', country: 'EC' },
  { code: 'LPB', name: 'El Alto International Airport', city: 'La Paz', country: 'BO' },
  { code: 'VVI', name: 'Viru Viru International Airport', city: 'Santa Cruz', country: 'BO' },
  { code: 'ASU', name: 'Silvio Pettirossi International Airport', city: 'Asunción', country: 'PY' },
  { code: 'MVD', name: 'Carrasco International Airport', city: 'Montevideo', country: 'UY' },

  // ── Oceania & Pacific ────────────────────────────────────────────────────────
  { code: 'SYD', name: 'Sydney Airport', city: 'Sydney', country: 'AU' },
  { code: 'MEL', name: 'Melbourne Airport', city: 'Melbourne', country: 'AU' },
  { code: 'BNE', name: 'Brisbane Airport', city: 'Brisbane', country: 'AU' },
  { code: 'PER', name: 'Perth Airport', city: 'Perth', country: 'AU' },
  { code: 'ADL', name: 'Adelaide Airport', city: 'Adelaide', country: 'AU' },
  { code: 'CBR', name: 'Canberra Airport', city: 'Canberra', country: 'AU' },
  { code: 'HBA', name: 'Hobart Airport', city: 'Hobart', country: 'AU' },
  { code: 'OOL', name: 'Gold Coast Airport', city: 'Gold Coast', country: 'AU' },
  { code: 'CNS', name: 'Cairns Airport', city: 'Cairns', country: 'AU' },
  { code: 'DRW', name: 'Darwin International Airport', city: 'Darwin', country: 'AU' },
  { code: 'AKL', name: 'Auckland Airport', city: 'Auckland', country: 'NZ' },
  { code: 'WLG', name: 'Wellington International Airport', city: 'Wellington', country: 'NZ' },
  { code: 'CHC', name: 'Christchurch Airport', city: 'Christchurch', country: 'NZ' },
  { code: 'ZQN', name: 'Queenstown Airport', city: 'Queenstown', country: 'NZ' },
  { code: 'NAN', name: 'Nadi International Airport', city: 'Nadi', country: 'FJ' },
  { code: 'PPT', name: 'Faa\'a International Airport', city: 'Papeete', country: 'PF' },
  { code: 'APW', name: 'Faleolo International Airport', city: 'Apia', country: 'WS' },
  { code: 'HIR', name: 'Honiara International Airport', city: 'Honiara', country: 'SB' },
  { code: 'POM', name: 'Port Moresby Jacksons International Airport', city: 'Port Moresby', country: 'PG' },
  { code: 'SUV', name: 'Suva Nausori Airport', city: 'Suva', country: 'FJ' },
  { code: 'GUM', name: 'Antonio B. Won Pat International Airport', city: 'Guam', country: 'GU' },
];


function searchAirports(query: string): AirportEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return AIRPORTS.filter(
    (a) =>
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.country.toLowerCase().includes(q)
  ).slice(0, 8);
}

/* ─── Airline data ────────────────────────────────────────────────────────── */

const AIRLINES: Array<{ name: string; iata: string }> = [
  { name: 'Emirates', iata: 'EK' },
  { name: 'Qatar Airways', iata: 'QR' },
  { name: 'Etihad Airways', iata: 'EY' },
  { name: 'Turkish Airlines', iata: 'TK' },
  { name: 'British Airways', iata: 'BA' },
  { name: 'Air France', iata: 'AF' },
  { name: 'Lufthansa', iata: 'LH' },
  { name: 'KLM', iata: 'KL' },
  { name: 'Swiss', iata: 'LX' },
  { name: 'Delta Air Lines', iata: 'DL' },
  { name: 'United Airlines', iata: 'UA' },
  { name: 'American Airlines', iata: 'AA' },
  { name: 'Air Canada', iata: 'AC' },
  { name: 'Singapore Airlines', iata: 'SQ' },
  { name: 'Cathay Pacific', iata: 'CX' },
  { name: 'Japan Airlines', iata: 'JL' },
  { name: 'ANA', iata: 'NH' },
  { name: 'Korean Air', iata: 'KE' },
  { name: 'Qantas', iata: 'QF' },
  { name: 'Air New Zealand', iata: 'NZ' },
  { name: 'Ethiopian Airlines', iata: 'ET' },
  { name: 'Kenya Airways', iata: 'KQ' },
  { name: 'South African Airways', iata: 'SA' },
  { name: 'EgyptAir', iata: 'MS' },
  { name: 'Royal Air Maroc', iata: 'AT' },
  { name: 'RwandAir', iata: 'WB' },
  { name: 'Uganda Airlines', iata: 'UR' },
  { name: 'Air Tanzania', iata: 'TC' },
  { name: 'Precision Air', iata: 'PW' },
  { name: 'Flydubai', iata: 'FZ' },
  { name: 'Air Arabia', iata: 'G9' },
  { name: 'Saudia', iata: 'SV' },
  { name: 'Oman Air', iata: 'WY' },
  { name: 'Gulf Air', iata: 'GF' },
  { name: 'Kuwait Airways', iata: 'KU' },
  { name: 'IndiGo', iata: '6E' },
  { name: 'Air India', iata: 'AI' },
  { name: 'SpiceJet', iata: 'SG' },
  { name: 'Thai Airways', iata: 'TG' },
  { name: 'Malaysia Airlines', iata: 'MH' },
  { name: 'Garuda Indonesia', iata: 'GA' },
  { name: 'Philippine Airlines', iata: 'PR' },
  { name: 'Vietnam Airlines', iata: 'VN' },
  { name: 'Ryanair', iata: 'FR' },
  { name: 'easyJet', iata: 'U2' },
  { name: 'Wizz Air', iata: 'W6' },
  { name: 'Vueling', iata: 'VY' },
  { name: 'Iberia', iata: 'IB' },
  { name: 'TAP Air Portugal', iata: 'TP' },
  { name: 'Finnair', iata: 'AY' },
  { name: 'SAS', iata: 'SK' },
  { name: 'Norwegian', iata: 'DY' },
  { name: 'LOT Polish Airlines', iata: 'LO' },
  { name: 'Alitalia', iata: 'AZ' },
  { name: 'Aeroflot', iata: 'SU' },
  { name: 'LATAM Airlines', iata: 'LA' },
  { name: 'Avianca', iata: 'AV' },
  { name: 'Copa Airlines', iata: 'CM' },
  { name: 'Southwest Airlines', iata: 'WN' },
  { name: 'JetBlue', iata: 'B6' },
  { name: 'Alaska Airlines', iata: 'AS' },
  { name: 'Frontier Airlines', iata: 'F9' },
  { name: 'Spirit Airlines', iata: 'NK' },
  { name: 'China Eastern', iata: 'MU' },
  { name: 'China Southern', iata: 'CZ' },
  { name: 'Air China', iata: 'CA' },
  { name: 'Hainan Airlines', iata: 'HU' },
  { name: 'Xiamen Airlines', iata: 'MF' },
  { name: 'Shenzhen Airlines', iata: 'ZH' },
  { name: 'Condor', iata: 'DE' },
  { name: 'TUI Airways', iata: 'BY' },
];

function searchAirlines(q: string): Array<{ name: string; iata: string }> {
  const query = q.toLowerCase().trim();
  if (!query) return AIRLINES.slice(0, 10);
  return AIRLINES.filter(
    (a) => a.name.toLowerCase().includes(query) || a.iata.toLowerCase().includes(query),
  ).slice(0, 8);
}

function AirlineSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  const results = useMemo(() => (focused ? searchAirlines(value) : []), [focused, value]);

  return (
    <View className="py-1">
      <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[10px] uppercase tracking-wider">
        Airline (optional)
      </Text>
      <TextInput
        style={{ fontFamily: 'Syne_500Medium' }}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        placeholder="e.g. Emirates, Kenya Airways"
        placeholderTextColor="rgba(248,250,252,0.32)"
        maxLength={50}
        className="mt-2 text-tics-text rounded-xl border border-[#96C7B3]/50 bg-white/[0.05] px-4 py-3.5"
      />
      {results.length > 0 && focused && (
        <View className="mt-1 rounded-xl border border-[#96C7B3]/50 bg-[#1a1f3a] overflow-hidden" style={{ maxHeight: 200 }}>
          {results.map((a) => (
            <Pressable
              key={a.iata}
              onPress={() => { onChange(a.name); setFocused(false); Keyboard.dismiss(); }}
              className="px-4 py-3 border-b border-white/5 active:bg-white/10"
            >
              <View className="flex-row items-center gap-3">
                <View className="rounded-lg bg-tics-amber/15 px-2 py-1">
                  <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-amber text-[11px]">{a.iata}</Text>
                </View>
                <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[13px]">{a.name}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      {value && !focused && (
        <View className="mt-1 flex-row items-center gap-1">
          <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-green text-[10px]">{value}</Text>
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
  const results = useMemo(() => (focused ? searchAirports(query) : []), [focused, query]);

  return (
    <View className="py-1">
      <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[10px] uppercase tracking-wider">
        {label}
      </Text>
      <TextInput
        style={{ fontFamily: 'Syne_500Medium' }}
        value={query}
        onChangeText={(t) => { setQuery(t); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        placeholder={placeholder}
        placeholderTextColor="rgba(248,250,252,0.32)"
        className="mt-2 text-tics-text rounded-xl border border-[#96C7B3]/50 bg-white/[0.05] px-4 py-3.5"
      />
      {error ? (
        <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-1 text-tics-red text-[10px]">{error}</Text>
      ) : null}
      {selected && !focused ? (
        <View className="mt-1 flex-row items-center gap-1.5">
          <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-green text-[10px]">
            {selected.code} · {selected.name}
          </Text>
        </View>
      ) : null}
      {results.length > 0 && focused ? (
        <View className="mt-1 rounded-xl border border-[#96C7B3]/50 bg-[#1a1f3a] overflow-hidden" style={{ maxHeight: 200 }}>
          {results.map((a) => (
            <Pressable
              key={a.code}
              onPress={() => {
                onSelect(a);
                setQuery(`${a.code} — ${a.city}`);
                setFocused(false);
                Keyboard.dismiss();
              }}
              className="px-4 py-3 border-b border-white/5 active:bg-white/10"
            >
              <View className="flex-row items-center gap-3">
                <View className="rounded-lg bg-tics-blue/20 px-2 py-1">
                  <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-blue text-[12px]">
                    {a.code}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[12px]">
                    {a.city}, {a.country}
                  </Text>
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[10px]">
                    {a.name}
                  </Text>
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
  const uid = useAuthStore((s) => s.token);
  const loading = useTripStore((s) => s.loading);
  const storeError = useTripStore((s) => s.error);
  const addTrip = useTripStore((s) => s.addTrip);

  // Form state
  const [title, setTitle] = useState('');
  const [departureAirport, setDepartureAirport] = useState<AirportEntry | null>(null);
  const [destinationAirport, setDestinationAirport] = useState<AirportEntry | null>(null);
  const [airline, setAirline] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [departureTime, setDepartureTime] = useState<Date | null>(null);
  const [arrivalTime, setArrivalTime] = useState<Date | null>(null);

  // Picker visibility — only needed for iOS inline picker
  // Android uses the imperative DateTimePickerAndroid.open() API to avoid crash
  const [showDepPicker, setShowDepPicker] = useState(false);
  const [showArrPicker, setShowArrPicker] = useState(false);

  function openDepPicker() {
    touch('departureTime');
    if (Platform.OS === 'android' && DateTimePickerAndroid) {
      DateTimePickerAndroid.open({
        value: departureTime ?? new Date(),
        mode: 'date',
        minimumDate: new Date(),
        onChange: (_: any, date: Date | undefined) => {
          if (!date) return;
          // After picking date, open time picker
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
            onChange: (_2: any, time: Date | undefined) => {
              if (time) {
                // Merge the picked date and time
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
      setShowDepPicker(true);
    }
  }

  function openArrPicker() {
    touch('arrivalTime');
    if (Platform.OS === 'android' && DateTimePickerAndroid) {
      DateTimePickerAndroid.open({
        value: arrivalTime ?? (departureTime ? new Date(departureTime.getTime() + 3600000) : new Date()),
        mode: 'date',
        minimumDate: departureTime ?? new Date(),
        onChange: (_: any, date: Date | undefined) => {
          if (!date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
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

  /* ── Submit ──────────────────────────────────────────── */

  async function onSubmit() {
    if (!uid) return router.push('/auth/login');
    if (!canSubmit || !departureAirport || !destinationAirport || !departureTime || !arrivalTime) return;

    const cleanFlightNumber = flightNumber.replace(/\s+/g, '').toUpperCase() || null;

    // Store structured airport data for correct API lookups
    // - from/to: used by the monitoring screen display (city, country)
    // - weatherLocationFrom/weatherLocationTo: "City,CC" format for OpenWeather API
    // - departureAirportCode/destinationAirportCode: IATA codes for AviationStack
    const trip = await addTrip(uid, {
      title: title.trim(),
      // Human-readable strings kept for display (compatible with old code)
      from: `${departureAirport.code} ${departureAirport.city}`,
      to: `${destinationAirport.code} ${destinationAirport.city}`,
      // Structured airport objects for clean API calls
      departureAirport: {
        airportCode: departureAirport.code,
        airportName: departureAirport.name,
        city: departureAirport.city,
        countryCode: departureAirport.country,
      },
      destinationAirport: {
        airportCode: destinationAirport.code,
        airportName: destinationAirport.name,
        city: destinationAirport.city,
        countryCode: destinationAirport.country,
      },
      // OpenWeather-compatible "City,CC" location strings
      weatherLocationFrom: `${departureAirport.city},${departureAirport.country}`,
      weatherLocationTo: `${destinationAirport.city},${destinationAirport.country}`,
      airline: airline.trim() || null,
      flightNumber: cleanFlightNumber,
      departureTime: departureTime.toISOString(),
      arrivalTime: arrivalTime.toISOString(),
      monitoringStatus: 'unknown',
      lastMileStatus: 'scheduled',
    } as any);
    if (trip) router.replace('/home');
  }

  /* ── Field helper ────────────────────────────────────── */

  function FieldError({ field }: { field: string }) {
    if (!touched[field] || !errors[field]) return null;
    return (
      <View className="mt-1.5 flex-row items-center gap-1">
        <Ionicons name="alert-circle" size={12} color="#EF4444" />
        <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-red text-[10px]">
          {errors[field]}
        </Text>
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
        contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 55, paddingBottom: 112, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center rounded-xl border border-[#96C7B3]/50 bg-white/[0.05]"
          >
            <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
          </Pressable>
          <View>
            <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[17px]">
              New Trip
            </Text>
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px]">
              Structured input for accurate monitoring
            </Text>
          </View>
        </View>

        {/* Form card */}
        <Card accent="green" className="py-5">
          <View className="gap-4">
            {/* Trip title */}
            <View className="py-1">
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[10px] uppercase tracking-wider">
                Trip Title
              </Text>
              <TextInput
                style={{ fontFamily: 'Syne_500Medium' }}
                value={title}
                onChangeText={setTitle}
                onBlur={() => touch('title')}
                placeholder="e.g. Business Trip to Dubai"
                placeholderTextColor="rgba(248,250,252,0.32)"
                maxLength={80}
                className="mt-2 text-tics-text rounded-xl border border-[#96C7B3]/50 bg-white/[0.05] px-4 py-3.5"
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
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[10px] uppercase tracking-wider">
                Flight Number (optional)
              </Text>
              <TextInput
                style={{ fontFamily: 'Syne_500Medium' }}
                value={flightNumber}
                onChangeText={(t) => setFlightNumber(t.replace(/\s+/g, '').toUpperCase())}
                onBlur={() => touch('flightNumber')}
                placeholder="e.g. EK203"
                placeholderTextColor="rgba(248,250,252,0.32)"
                autoCapitalize="characters"
                maxLength={6}
                className="mt-2 text-tics-text rounded-xl border border-[#96C7B3]/50 bg-white/[0.05] px-4 py-3.5"
              />
              <FieldError field="flightNumber" />
              {flightNumber && !errors.flightNumber ? (
                <View className="mt-1 flex-row items-center gap-1">
                  <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-green text-[10px]">
                    Valid: {flightNumber}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Departure time */}
            <View className="py-1">
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[10px] uppercase tracking-wider">
                Departure Date & Time
              </Text>
              <Pressable
                onPress={openDepPicker}
                className="mt-2 flex-row items-center justify-between rounded-xl border border-[#96C7B3]/50 bg-white/[0.05] px-4 py-3.5"
              >
                <Text
                  style={{ fontFamily: 'Syne_500Medium', color: departureTime ? 'rgba(248,250,252,0.9)' : 'rgba(248,250,252,0.32)', fontSize: 13 }}
                >
                  {departureTime ? formatDateDisplay(departureTime) : 'Tap to select'}
                </Text>
                <Ionicons name="calendar-outline" size={18} color="rgba(248,250,252,0.5)" />
              </Pressable>
              {/* iOS only — inline compact picker */}
              {Platform.OS === 'ios' && showDepPicker && (
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
              {/* iOS — show picker inline when no date yet */}
              {Platform.OS === 'ios' && !showDepPicker && !departureTime && (
                <DateTimePicker
                  value={new Date()}
                  mode="datetime"
                  display="compact"
                  minimumDate={new Date()}
                  onChange={(_, d) => {
                    if (d) { setDepartureTime(d); touch('departureTime'); }
                  }}
                  themeVariant="dark"
                  style={{ marginTop: 8 }}
                />
              )}
              {Platform.OS === 'ios' && departureTime && !showDepPicker && (
                <Pressable onPress={() => setShowDepPicker(true)} className="mt-1">
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-blue text-[11px]">Change</Text>
                </Pressable>
              )}
              <FieldError field="departureTime" />
            </View>

            {/* Arrival time */}
            <View className="py-1">
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[10px] uppercase tracking-wider">
                Arrival Date & Time
              </Text>
              <Pressable
                onPress={openArrPicker}
                className="mt-2 flex-row items-center justify-between rounded-xl border border-[#96C7B3]/50 bg-white/[0.05] px-4 py-3.5"
              >
                <Text
                  style={{ fontFamily: 'Syne_500Medium', color: arrivalTime ? 'rgba(248,250,252,0.9)' : 'rgba(248,250,252,0.32)', fontSize: 13 }}
                >
                  {arrivalTime ? formatDateDisplay(arrivalTime) : 'Tap to select'}
                </Text>
                <Ionicons name="calendar-outline" size={18} color="rgba(248,250,252,0.5)" />
              </Pressable>
              {Platform.OS === 'ios' && showArrPicker && (
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
              {Platform.OS === 'ios' && !showArrPicker && !arrivalTime && (
                <DateTimePicker
                  value={departureTime ? new Date(departureTime.getTime() + 3600000) : new Date()}
                  mode="datetime"
                  display="compact"
                  minimumDate={departureTime ?? new Date()}
                  onChange={(_, d) => {
                    if (d) { setArrivalTime(d); touch('arrivalTime'); }
                  }}
                  themeVariant="dark"
                  style={{ marginTop: 8 }}
                />
              )}
              {Platform.OS === 'ios' && arrivalTime && !showArrPicker && (
                <Pressable onPress={() => setShowArrPicker(true)} className="mt-1">
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-blue text-[11px]">Change</Text>
                </Pressable>
              )}
              <FieldError field="arrivalTime" />
            </View>

            {/* Weather location preview */}
            {destinationAirport && (
              <View className="flex-row items-center gap-2 rounded-xl border border-[#96C7B3]/50 bg-white/[0.05] px-4 py-3">
                <Ionicons name="partly-sunny" size={16} color="#FBBF24" />
                <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px] flex-1">
                  Weather lookup: <Text className="text-tics-text">{destinationAirport.city},{destinationAirport.country}</Text>
                </Text>
              </View>
            )}
          </View>

          {/* Errors */}
          {storeError ? (
            <Text className="mt-3 text-[12px] font-semibold text-tics-red">{storeError}</Text>
          ) : null}

          {/* Submit */}
          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit || loading}
            style={{ borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
            className="mt-6 bg-tics-amber"
          >
            {loading ? (
              <ActivityIndicator size={18} color="#000" />
            ) : (
              <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-[14px] text-black">
                Save Trip
              </Text>
            )}
          </Pressable>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
