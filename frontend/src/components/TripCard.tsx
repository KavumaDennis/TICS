import { Pressable, Text, View } from 'react-native';
import Fontisto from '@expo/vector-icons/Fontisto';
import Octicons from '@expo/vector-icons/Octicons';

import type { Trip } from '@/src/store/tripStore';
import Card from '@/src/components/Card';
import { useTripStatus } from '@/src/hooks/useTripStatus';

export default function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const { statusInfo, label, isCompleted, isCancelled } = useTripStatus(trip);

  const isCompletedOrCancelled = isCompleted || isCancelled;

  return (
    <Pressable onPress={onPress} className="active:opacity-85">
      <Card
        accent="blue"
        className={`flex-row items-center justify-between p-4 rounded-4xl bg-tics-amber/25 border border-tics-amber/10
          }`}
      >
        <View className='flex-row flex-1 min-w-0 items-center gap-5'>
          <View className={`py-3 px-3 rounded-full ${isCompletedOrCancelled ? 'bg-tics-navy/30' : 'bg-tics-amber/20 border border-tics-amber/10'}`}>
            <Fontisto name="plane" size={24} color={isCompletedOrCancelled ? '#64748B' : '#64748B'} />
          </View>
          <View>
            <View className="flex-row items-center">
              <Text
                numberOfLines={2}
                ellipsizeMode="tail"
                style={{ fontFamily: 'Syne_700Bold' }}
                className={`text-[16px] flex-shrink ${isCompletedOrCancelled ? 'text-tics-muted' : 'text-tics-text'}`}>{trip.title}</Text>
            </View>
            <View className='flex-row items-center gap-1 mt-1'>
              <Text style={{
                fontFamily: 'Syne_500Medium',
              }} className="text-tics-muted text-[12px] mx-1">
                {new Date(trip.departureTime).toLocaleString([], { dateStyle: 'medium' })}
              </Text>
              <Octicons name="dash" size={15} color="white" />
              <Text style={{
                fontFamily: 'Syne_500Medium',
              }} className="text-tics-muted text-[12px]">
                {new Date(trip.arrivalTime).toLocaleString([], { dateStyle: 'medium' })}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: 'Syne_700Bold',
              }} className={`mt-2 text-[12px] ${isCompletedOrCancelled ? 'text-tics-muted/60' : 'text-tics-muted'}`}
            >
              {trip.flightNumber}
            </Text>
          </View>
        </View>
        <View style={{ backgroundColor: statusInfo.bgColor }} className="p-1 px-2 rounded-full border border-tics-amber/10">
          <Text style={{ fontFamily: 'Syne_700Bold', color: statusInfo.color, fontSize: 11 }}>{statusInfo.label}</Text>
        </View>
      </Card>
    </Pressable>
  );
}