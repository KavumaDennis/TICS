/**
 * OperatorDetailsScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays details about the traveler's selected operator with star rating.
 * Accessed via the "Contact" button from LastMileCoordinationScreen.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc, setDoc, serverTimestamp, collection } from 'firebase/firestore';

import PersistentTabBar from '@/src/components/PersistentTabBar';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import { useAuthStore } from '@/src/store/useAuthStore';
import { listenToActiveOperator } from '@/src/services/OperatorService';
import type { OperatorDoc } from '@/src/firebase/lastMileTypes';
import { SafeText } from '@/src/components/responsive/SafeText';

const STAR_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#22C55E', '#22C55E'];

export default function OperatorDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { operatorId: paramOperatorId, tripId } = useLocalSearchParams<{ operatorId?: string; tripId?: string }>();
  const uid = useAuthStore((s) => s.token);

  const [operator, setOperator] = useState<(OperatorDoc & { id: string }) | null>(null);
  const [activeOp, setActiveOp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userRating, setUserRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  // Load operator details
  useEffect(() => {
    (async () => {
      try {
        const db = getFirebaseFirestore();
        let opId = paramOperatorId;

        // If no operatorId param, try to get active operator for this trip
        if (!opId && tripId && uid) {
          try {
            const { getActiveOperator } = await import('@/src/services/OperatorService');
            const active = await getActiveOperator(uid, tripId);
            if (active) {
              opId = active.operatorId;
              setActiveOp(active);
            }
          } catch { }
        }

        if (!opId) {
          setLoading(false);
          return;
        }

        // Try operators collection first, fall back to users collection
        let operatorData: (OperatorDoc & { id: string }) | null = null;
        
        try {
          const snap = await getDoc(doc(db, 'operators', opId));
          if (snap.exists()) {
            operatorData = { id: snap.id, ...snap.data() } as OperatorDoc & { id: string };
          }
        } catch (e) {
          console.log('Could not read from operators collection, trying users collection');
        }

        // Also try users collection — if operators doc exists but is missing key fields
        // (e.g. only has rating fields from a previous setDoc call), merge the users doc
        // data so contact info (phone, email, name) is preserved.
        try {
          const userSnap = await getDoc(doc(db, 'users', opId));
          if (userSnap.exists()) {
            const userData = userSnap.data() as any;
            if (operatorData) {
              // Merge: users collection fields fill in gaps missing from operators doc
              if (!operatorData.contactPhone && !operatorData.phone) {
                operatorData.contactPhone = userData.contactPhone || userData.phone || '';
                operatorData.phone = userData.phone || userData.contactPhone || '';
              }
              if (!operatorData.contactEmail && !operatorData.email) {
                operatorData.contactEmail = userData.contactEmail || userData.email || '';
                operatorData.email = userData.email || userData.contactEmail || '';
              }
              if (!operatorData.name && !operatorData.lodgeName) {
                operatorData.name = userData.name || userData.lodgeName || '';
                operatorData.lodgeName = userData.lodgeName || userData.name || '';
              }
              if (!operatorData.logoUrl && !operatorData.profileImage) {
                operatorData.logoUrl = userData.logoUrl || userData.profileImage || '';
                operatorData.profileImage = userData.profileImage || userData.logoUrl || '';
              }
              if (!operatorData.description) {
                operatorData.description = userData.description || '';
              }
              if (!operatorData.location) {
                operatorData.location = userData.location || '';
              }
              if (!operatorData.country) {
                operatorData.country = userData.country || '';
              }
              if (!operatorData.languages || operatorData.languages.length === 0) {
                operatorData.languages = userData.languages || [];
              }
              if (!operatorData.website) {
                operatorData.website = userData.website || '';
              }
              if (!operatorData.averageRating && !operatorData.rating) {
                operatorData.averageRating = userData.averageRating || userData.rating || 0;
                operatorData.rating = userData.rating || userData.averageRating || 0;
              }
              if (!operatorData.totalRatings) {
                operatorData.totalRatings = userData.totalRatings || 0;
              }
            } else {
              // No operators doc found — use users doc directly
              operatorData = { id: userSnap.id, ...userData } as OperatorDoc & { id: string };
            }
          }
        } catch (e: any) {
          console.error('Failed to load operator from users collection:', e);
        }

        if (operatorData) {
          setOperator(operatorData);
        }
        setLoading(false);
        return;
      } catch (e: any) {
        console.error('Failed to load operator:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [paramOperatorId, tripId, uid]);

  // Handle rating
  const handleRate = useCallback(async (rating: number) => {
    if (!operator?.id || !uid || ratingSubmitted) return;
    setUserRating(rating);
    setSubmittingRating(true);
    try {
      const db = getFirebaseFirestore();
      
      // Update average rating
      const currentTotal = operator.totalRatings || 0;
      const currentAvg = operator.averageRating || operator.rating || 0;
      const newTotal = currentTotal + 1;
      const newAvg = ((currentAvg * currentTotal) + rating) / newTotal;
      
      // Try to update in both collections for maximum compatibility
      const opRef = doc(db, 'operators', operator.id);
      const userRef = doc(db, 'users', operator.id);
      
      // Try operators collection first with merge to preserve existing fields
      try {
        await setDoc(opRef, {
          averageRating: newAvg,
          totalRatings: newTotal,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (e) {
        console.log('Failed to write to operators collection, trying users:', e);
        // Fallback to users collection
        try {
          await setDoc(userRef, {
            averageRating: newAvg,
            totalRatings: newTotal,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } catch (e2) {
          console.log('Failed to write to users collection as well:', e2);
          // Last resort: write to a ratings subcollection
          const ratingRef = doc(collection(db, 'operators', operator.id, 'ratings'), uid || 'anonymous');
          await setDoc(ratingRef, { rating, createdAt: serverTimestamp() });
        }
      }
      
      setRatingSubmitted(true);
      Alert.alert('Thank You!', 'Your rating has been submitted.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to submit rating');
    } finally {
      setSubmittingRating(false);
    }
  }, [operator, uid, ratingSubmitted]);

  const handleCall = async (phone: string) => {
    const formatted = phone.startsWith('0') ? `256${phone.substring(1)}` : phone;
    const url = `tel:${formatted}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', 'Unable to open phone dialer');
    }
  };

  const handleWhatsApp = async (phone: string) => {
    const clean = phone.replace(/[^\d]/g, '');
    const message = encodeURIComponent('Hello, I am a TICS traveler. I would like to inquire about my ride.');
    const whatsappUrl = `whatsapp://send?phone=${clean}&text=${message}`;
    const supported = await Linking.canOpenURL(whatsappUrl);
    if (supported) {
      await Linking.openURL(whatsappUrl);
    } else {
      Alert.alert('WhatsApp Not Installed', 'Please install WhatsApp to contact the operator.');
    }
  };

  const handleEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`).catch(() => {
      Alert.alert('Error', 'Unable to open email client');
    });
  };

  const phone = (operator?.contactPhone || operator?.phone || activeOp?.operatorPhone || '') as string;
  const email = (operator?.contactEmail || operator?.email || '') as string;
  const displayName = operator?.lodgeName || operator?.name || activeOp?.operatorName || 'Operator';
  const hasLogo = operator?.logoUrl || operator?.profileImage;
  const displayRating = operator?.averageRating || operator?.rating;

  return (
    <View className="flex-1 p-1">
      {/* Header */}
      <View className="p-2 mb-4 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full">
        <Pressable
          onPress={() => router.back()}
          className="bg-tics-amber/35 border border-tics-amber/20 rounded-full"
          style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={20} color="#96C7B3" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 17 }}>Operator Details</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>Contact & information</SafeText>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#60A5FA" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 13, marginTop: 12 }}>
            Loading operator details...
          </SafeText>
        </View>
      ) : !operator && !activeOp ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Ionicons name="business-outline" size={48} color="rgba(248,250,252,0.15)" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 15, marginTop: 12, textAlign: 'center' }}>
            Operator details not available
          </SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
            No operator is currently selected for this trip. Please select an operator first.
          </SafeText>
          <Pressable
            onPress={() => {
              const params: any = {};
              if (tripId) params.tripId = tripId;
              router.push({ pathname: '/operator/select' as any, params } as any);
            }}
            className="rounded-full mt-6"
            style={{ paddingHorizontal: 24, paddingVertical: 14, backgroundColor: '#3B82F6' }}
          >
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 13 }}>Select Operator</SafeText>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ gap: 14, paddingHorizontal: 4, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          {/* Logo / Name Card */}
          <View className="rounded-4xl bg-tics-amber/25 border border-tics-amber/10" style={{ padding: 24, alignItems: 'center' }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 24,
                backgroundColor: 'rgba(59,130,246,0.15)',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                marginBottom: 12,
              }}
            >
              {hasLogo ? (
                <View style={{ width: 80, height: 80, overflow: 'hidden' }}>
                  <Image source={{ uri: operator?.logoUrl || operator?.profileImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                </View>
              ) : (
                <Ionicons name="business" size={36} color="#60A5FA" />
              )}
            </View>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 18, textAlign: 'center' }}>
              {displayName}
            </SafeText>
            {operator?.description && (
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 }}>
                {operator.description}
              </SafeText>
            )}

            {/* Star Rating Display */}
            {displayRating ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Ionicons
                      key={i}
                      name={i <= Math.round(displayRating) ? 'star' : 'star-outline'}
                      size={16}
                      color={i <= Math.round(displayRating) ? STAR_COLORS[Math.min(i - 1, 4)] : '#64748b'}
                    />
                  ))}
                </View>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>
                  {displayRating.toFixed(1)} ({operator?.totalRatings || 0})
                </SafeText>
              </View>
            ) : null}
          </View>

          {/* Contact Information */}
          <View className="rounded-4xl bg-tics-amber/25 border border-tics-amber/10" style={{ padding: 20 }}>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 11, letterSpacing: 0.8, marginBottom: 14 }}>
              CONTACT INFORMATION
            </SafeText>

            {phone ? (
              <View style={{ marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="call" size={18} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 10, letterSpacing: 0.8 }}>PHONE</SafeText>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 13, marginTop: 2 }}>{phone}</SafeText>
                </View>
                <Pressable onPress={() => handleCall(phone)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(34,197,94,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="call" size={16} color="#22C55E" />
                </Pressable>
                <Pressable onPress={() => handleWhatsApp(phone)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(37,211,102,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                </Pressable>
              </View>
            ) : null}

            {email ? (
              <View style={{ marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(59,130,246,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mail" size={18} color="#60A5FA" />
                </View>
                <View style={{ flex: 1 }}>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 10, letterSpacing: 0.8 }}>EMAIL</SafeText>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 13, marginTop: 2 }}>{email}</SafeText>
                </View>
                <Pressable onPress={() => handleEmail(email)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(59,130,246,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mail" size={16} color="#60A5FA" />
                </Pressable>
              </View>
            ) : null}

            {operator?.location && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(245,158,11,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="location" size={18} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 10, letterSpacing: 0.8 }}>LOCATION</SafeText>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 13, marginTop: 2 }}>
                    {operator.location}{operator.country ? `, ${operator.country}` : ''}
                  </SafeText>
                </View>
              </View>
            )}
          </View>

          {/* Rate the Operator */}
          <View className="rounded-4xl bg-tics-amber/25 border border-tics-amber/10" style={{ padding: 20 }}>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F59E0B', fontSize: 11, letterSpacing: 0.8, marginBottom: 14 }}>
              RATE THIS OPERATOR
            </SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, marginBottom: 12 }}>
              {ratingSubmitted ? 'Thank you for your rating!' : `How was your experience with ${displayName}?`}
            </SafeText>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
              {([1, 2, 3, 4, 5] as const).map((star) => (
                <Pressable
                  key={star}
                  onPress={() => handleRate(star)}
                  disabled={submittingRating || ratingSubmitted}
                >
                  <Ionicons
                    name={star <= (userRating as number) ? 'star' : 'star-outline'}
                    size={36}
                    color={star <= (userRating as number) ? STAR_COLORS[star - 1] : '#64748b'}
                  />
                </Pressable>
              ))}
            </View>
            {submittingRating && (
              <ActivityIndicator size="small" color="#F59E0B" />
            )}
          </View>

          {/* Additional Info */}
          {operator?.languages || operator?.availableDrivers != null || operator?.website ? (
            <View className="rounded-4xl bg-tics-amber/25 border border-tics-amber/10" style={{ padding: 20 }}>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 11, letterSpacing: 0.8, marginBottom: 14 }}>
                ADDITIONAL INFO
              </SafeText>

              {operator.languages && operator.languages.length > 0 && (
                <View style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="language" size={16} color="#94a3b8" />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {operator.languages.map((lang, i) => (
                      <View key={i} style={{ borderRadius: 99, backgroundColor: 'rgba(139,92,246,0.15)', paddingHorizontal: 8, paddingVertical: 2 }}>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 9 }}>{lang}</SafeText>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {operator.availableDrivers != null && (
                <View style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="people" size={16} color="#22C55E" />
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#e2e8f0', fontSize: 12 }}>
                    {operator.availableDrivers} available driver{operator.availableDrivers !== 1 ? 's' : ''}
                  </SafeText>
                </View>
              )}

              {operator.website ? (
                <Pressable onPress={() => Linking.openURL(operator.website!).catch(() => { })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="globe" size={16} color="#60A5FA" />
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#60A5FA', fontSize: 12 }}>{operator.website}</SafeText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Action Buttons */}
          {phone ? (
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => handleCall(phone!)}
                className="rounded-full p-5"
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: 'rgba(59,130,246,0.15)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)'
                }}
              >
                <Ionicons name="call" size={20} color="#fff" />
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 14 }}>Call {displayName}</SafeText>
              </Pressable>
              <Pressable
                onPress={() => handleWhatsApp(phone!)}
                className=" rounded-full p-5"
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: 'rgba(59,130,246,0.15)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)'
                }}
              >
                <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 14 }}>WhatsApp {displayName}</SafeText>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}
      <PersistentTabBar />
    </View>
  );
}
