import { Redirect } from 'expo-router';

import { useTripStore } from '@/src/store/tripStore';

export default function LastMileRoute() {
  const tripId = useTripStore((s) => s.trips[0]?.id ?? null);
  if (!tripId) return <Redirect href={'/trip/add' as any} />;
  return <Redirect href={({ pathname: `/last-mile/${tripId}` } as any)} />;
}
