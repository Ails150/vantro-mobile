import { Stack } from 'expo-router';

export default function ScheduleRequestLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0f1923' },
        animation: 'slide_from_right',
      }}
    />
  );
}
