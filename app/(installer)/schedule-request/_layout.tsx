import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function ScheduleRequestLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.base },
        animation: 'slide_from_right',
      }}
    />
  );
}
