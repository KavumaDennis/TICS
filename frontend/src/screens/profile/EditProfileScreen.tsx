/**
 * EditProfileScreen — edit all user profile fields.
 * Saves: display name, phone number (stored in Firestore).
 * Email is managed by auth provider; shown read-only.
 */
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

import { useAuthStore } from '@/src/store/useAuthStore';
import { useUserDocStore } from '@/src/store/userDocStore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import { emailLocalPart } from '@/src/utils/displayName';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
  editable = true,
  hint,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  editable?: boolean;
  hint?: string;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: 'Syne_500Medium', color: 'rgba(148,163,184,0.7)', fontSize: 11, letterSpacing: 0.8, marginBottom: 6 }}>
        {label.toUpperCase()}
      </Text>
      <View
        
        className={`rounded-2xl border border-[#96C7B3]/50 px-3 py-2 ${editable ? 'bg-white/[0.05]' : 'bg-white/[0.01]'}`}
        style={{
          paddingHorizontal: 16, paddingVertical: 13,
        }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="rgba(248,250,252,0.3)"
          keyboardType={keyboardType}
          editable={editable}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
          style={{ fontFamily: 'Syne_500Medium', color: editable ? '#f8fafc' : '#64748b', fontSize: 15 }}
        />
      </View>
      {hint ? (
        <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 11, marginTop: 5 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const updateProfileName = useAuthStore((s) => s.updateProfileName);
  const userDoc = useUserDocStore((s) => s.doc);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.name?.trim() ?? '');
    setPhone((userDoc as any)?.phone?.trim() ?? '');
  }, [user, userDoc]);

  async function onSave() {
    if (!user) return;
    setSaving(true);
    try {
      const db = getFirebaseFirestore();
      const trimmedName = name.trim();
      const trimmedPhone = phone.trim();

      // Single Firestore write with all allowed fields
      await updateDoc(doc(db, 'users', user.uid), {
        name: trimmedName || null,
        phone: trimmedPhone || null,
        updatedAt: serverTimestamp(),
      });

      // Also update the in-memory auth store so the dashboard reflects immediately
      await updateProfileName(trimmedName);

      Alert.alert('Saved', 'Your profile has been updated.');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save profile. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  const suggested = emailLocalPart(user?.email);

  return (
    <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingBottom: 16 }}>
        <Pressable
          onPress={() => router.back()}
          className="border border-[#96C7B3]/50 bg-white/[0.05] rounded-xl"
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 20 }}>Edit Profile</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* Avatar placeholder */}
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(59,130,246,0.2)', borderWidth: 2, borderColor: 'rgba(59,130,246,0.4)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person" size={30} color="rgba(248,250,252,0.7)" />
          </View>
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12, marginTop: 8 }}>
            {user?.email ?? '—'}
          </Text>
        </View>

        {/* Editable fields */}
        <Field
          label="Display name"
          value={name}
          onChange={setName}
          placeholder={suggested}
          hint={`Shown on dashboard. Leave blank to use "${suggested}".`}
        />

        <Field
          label="Phone number (optional)"
          value={phone}
          onChange={setPhone}
          placeholder="+1 234 567 8900"
          keyboardType="phone-pad"
          hint="Used for SMS alerts if enabled."
        />

        {/* Read-only fields */}
        <Field
          label="Email address"
          value={user?.email ?? ''}
          editable={false}
          hint="Email is managed by your sign-in provider."
        />

        <Field
          label="Account type"
          value={(userDoc as any)?.premium ? 'Premium' : 'Free'}
          editable={false}
        />

        {/* Save button */}
        <Pressable
          onPress={onSave}
          disabled={saving}
          style={{
            marginTop: 8, borderRadius: 16, backgroundColor: '#F59E0B',
            paddingVertical: 16, alignItems: 'center', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving
            ? <ActivityIndicator size={18} color="#000" />
            : <Text style={{ fontFamily: 'Syne_700Bold', color: '#000', fontSize: 15 }}>Save changes</Text>}
        </Pressable>

        {/* Preview */}
        <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 }}>
          Dashboard will show:{' '}
          <Text style={{ color: '#94a3b8' }}>{name.trim() || suggested}</Text>
        </Text>

      </ScrollView>
    </View>
  );
}
