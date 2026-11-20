import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../src/auth';
import { colors } from '../../src/theme';

export default function AuthLayout() {
  const { user } = useAuth();
  if (user) return <Redirect href="/discover" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
