import { Pressable, Text, View } from 'react-native';
import Fontisto from '@expo/vector-icons/Fontisto';
import Octicons from '@expo/vector-icons/Octicons';

import type { Trip } from '@/src/store/tripStore';
import Card from '@/src/components/Card';

export default function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const depMs = Date.parse(trip.departureTime);
  const arrMs = Date.parse(trip.arrivalTime);
  const now = Date.now();
  const isPast = Number.isFinite(arrMs) ? now > arrMs : false;
  const isActive = Number.isFinite(depMs) && Number.isFinite(arrMs) ? now >= depMs && now <= arrMs : false;

  const statusLabel = isPast ? 'Completed' : isActive ? 'Active' : 'Upcoming';
  const statusColor =
    trip.monitoringStatus === 'at_risk' ? 'text-tics-amber' : isPast ? 'text-white/70' : 'text-tics-green';
  const pillBg = trip.monitoringStatus === 'at_risk' ? 'bg-tics-amber/15' : isPast ? 'bg-white/10' : 'bg-tics-green/15';

  return (
    <Pressable onPress={onPress} className="active:opacity-85">
      <Card accent="blue" className="flex-row items-center justify-between px-4 py-5 bg-tics-blue/20 rounded-2xl">
        <View className='flex-row items-center  gap-5'>
          <View className='py-3 px-3 rounded-full bg-tics-blue/20'>
            <Fontisto name="plane" size={24} color="#3B82F6" />
          </View>
          <View>
            <View className="flex-row items-center">
              <Text style={{
                fontFamily: 'Syne_700Bold',
              }} className="text-tics-text text-[16px]">{trip.title}</Text>
            </View>
            <View className='flex-row items-center gap-1 mt-1'>
              <Text style={{
                fontFamily: 'Syne_500Medium',
              }} className="text-tics-muted text-[13px]">
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
              }} className="mt-2 text-tics-muted text-[12px]"
            >
              {trip.flightNumber}
            </Text>
          </View>
        </View>
        <View className={`${pillBg} p-1 px-2 rounded-full`}>
          <Text style={{ fontFamily: 'Syne_700Bold' }} className={`${statusColor} text-[11px]`}>{statusLabel}</Text>
        </View>
      </Card>
    </Pressable>
  );
}
