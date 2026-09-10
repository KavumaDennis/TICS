/**
 * EditProfileScreen — edit all user profile fields + profile image.
 * Saves: display name, phone number, profile image (stored in Firebase Storage).
 * Email is managed by auth provider; shown read-only.
 */
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View, ActivityIndicator, Platform, KeyboardAvoidingView, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';

import { useAuthStore } from '@/src/store/useAuthStore';
import { useUserDocStore } from '@/src/store/userDocStore';
import { getFirebaseFirestore, getFirebaseStorage } from '@/src/firebase/firebaseApp';
import { emailLocalPart } from '@/src/utils/displayName';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeText } from '@/src/components/responsive/SafeText';

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
  editable = true,
  hint,
  onSubmitEditing,
  inputRef,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  editable?: boolean;
  hint?: string;
  onSubmitEditing?: () => void;
  inputRef?: any;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <SafeText className='text-tics-text ml-2 ' style={{ fontFamily: 'ShareTech_400Regular', fontSize: 10, letterSpacing: 0.8, marginBottom: 6 }}>
        {label.toUpperCase()}
      </SafeText>
      <View
        
        className={`rounded-full border border-tics-amber/50 px-3 py-2 ${editable ? 'bg-white/[0.05]' : 'bg-white/[0.01]'}`}
        style={{
          paddingHorizontal: 16, paddingVertical: 13,
        }}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="rgba(248,250,252,0.3)"
          keyboardType={keyboardType}
          editable={editable}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
          style={{ fontFamily: 'ShareTech_400Regular', color: editable ? '#f8fafc' : '#64748b', fontSize: 15 }}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={onSubmitEditing ? 'next' : 'done'}
        />
      </View>
      {hint ? (
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 11, marginTop: 5 }}>{hint}</SafeText>
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
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setName(user?.name?.trim() ?? '');
    setPhone((userDoc as any)?.phone?.trim() ?? '');
    setPhotoURL((userDoc as any)?.photoURL ?? null);
  }, [user, userDoc]);

  async function pickImage() {
    // Request permission
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'We need camera roll permissions to set a profile picture.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const uri = asset.uri;

      if (!uri) {
        Alert.alert('Error', 'Could not read image data.');
        return;
      }

      // Upload to Firebase Storage
      const storage = getFirebaseStorage();
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const storageRef = ref(storage, `profile_photos/${user!.uid}/${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      setPhotoURL(downloadURL);
    } catch (e: any) {
      console.error('[EditProfile] Upload error:', e);
      Alert.alert('Upload Error', e?.message ?? 'Failed to upload image. Check your Firebase Storage rules and try again.');
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    if (!user) return;
    setSaving(true);
    try {
      const db = getFirebaseFirestore();
      const trimmedName = name.trim();
      const trimmedPhone = phone.trim();

      const updateData: Record<string, any> = {
        updatedAt: serverTimestamp(),
      };

      // Only include fields that have values
      if (trimmedName) {
        updateData.name = trimmedName;
      }
      if (trimmedPhone) {
        updateData.phone = trimmedPhone;
      }

      // Only update photoURL if it changed
      if (photoURL !== (userDoc as any)?.photoURL) {
        updateData.photoURL = photoURL || null;
      }

      // Single Firestore write with all allowed fields
      await updateDoc(doc(db, 'users', user.uid), updateData);

      // Also update the in-memory auth store so the dashboard reflects immediately
      if (trimmedName) {
        await updateProfileName(trimmedName);
      }

      Alert.alert('Saved', 'Your profile has been updated.');
      router.back();
    } catch (e: any) {
      console.error('[EditProfile] Save error:', e);
      Alert.alert('Error', e?.message ?? 'Could not save profile. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  const suggested = emailLocalPart(user?.email);

  return (
    <KeyboardAvoidingView 
      className="flex-1 p-1" 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View
      className='bg-tics-amber/25 border border-tics-amber/10 rounded-full p-2 gap-2'
      style={{ flexDirection: 'row', alignItems: 'center',}}>
        <Pressable
          onPress={() => router.back()}
          className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full"
          style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 17 }}>Edit Profile</SafeText>
      </View>

      <ScrollView 
        contentContainerStyle={{ paddingBottom: 40 }} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        className='px-1'
      >

        {/* Avatar — tappable to change */}
        <View className='mt-5' style={{ alignItems: 'center', marginBottom: 28 }}>
          <Pressable onPress={pickImage} disabled={uploading} style={{ alignItems: 'center' }}>
            {photoURL ? (
              <View style={{ width: 80, height: 80, borderRadius: 40, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(59,130,246,0.4)' }}>
                <View style={{ width: 80, height: 80, overflow: 'hidden' }}>
                  <Image source={{ uri: photoURL }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                </View>
              </View>
            ) : (
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(59,130,246,0.2)', borderWidth: 2, borderColor: 'rgba(59,130,246,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="person" size={34} color="rgba(248,250,252,0.7)" />
                )}
              </View>
            )}
            <View style={{ position: 'absolute', bottom: -2, right: -8, backgroundColor: '#3B82F6', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0a0b1e' }}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </Pressable>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, marginTop: 10 }}>
            {user?.email ?? '—'}
          </SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 10, marginTop: 2 }}>
            Tap the camera icon to change your photo
          </SafeText>
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
          disabled={saving || uploading}
          style={{
            alignItems: 'center', opacity: saving || uploading ? 0.7 : 1,
          }}
          className='p-6 items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full'
        >
          {saving
            ? <ActivityIndicator size={18} color="#000" />
            : <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 15 }}>Save changes</SafeText>}
        </Pressable>

        {/* Preview */}
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 }}>
          Dashboard will show:{' '}
          <SafeText style={{ color: '#94a3b8' }}>{name.trim() || suggested}</SafeText>
        </SafeText>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}