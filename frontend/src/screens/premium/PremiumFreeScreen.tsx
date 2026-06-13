import { useRouter } from 'expo-router';
import PremiumShell from '@/src/screens/premium/PremiumShell';

export default function PremiumFreeScreen() {
  const router = useRouter();
  return (
    <PremiumShell
      title="Free Experience"
      subtitle="Use core features for free."
      primaryLabel="Get Started"
      onPrimary={() => router.push('/premium/benefits' as any)}
    />
  );
}
