import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

type Step = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  state: 'done' | 'active' | 'todo';
};

export type ProgressTrackerProps = {
  steps: Step[];
};

export default function ProgressTracker({ steps }: ProgressTrackerProps) {
  return (
    <View className="mt-3">
      <View className="flex-row items-center justify-between">
        {steps.map((s, idx) => {
          const isDone = s.state === 'done';
          const isActive = s.state === 'active';

          return (
            <View key={`${s.label}-${idx}`} className="flex-1 items-center">
              <View className="flex-row items-center">
                <View
                  className={[
                    'h-8 w-8 items-center justify-center rounded-full border',
                    isDone
                      ? 'border-tics-green bg-tics-green/20'
                      : isActive
                        ? 'border-sky-400/60 bg-sky-400/15'
                        : 'border-white/15 bg-white/5',
                  ].join(' ')}
                >
                  <Ionicons
                    name={isDone ? 'checkmark' : s.icon}
                    size={16}
                    color={
                      isDone ? '#22C55E' : isActive ? 'rgba(125,211,252,0.95)' : 'rgba(234,242,255,0.60)'
                    }
                  />
                </View>

                {idx < steps.length - 1 ? (
                  <View
                    className={[
                      'mx-2 h-[2px] flex-1 rounded-full',
                      isDone ? 'bg-tics-green/70' : 'bg-white/10',
                    ].join(' ')}
                  />
                ) : null}
              </View>
              <Text className="mt-2 text-[11px] text-tics-muted">{s.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

