import { Redirect, Stack } from 'expo-router';

import { homePath, useAuth } from '../../src/auth';
import { colors } from '../../src/theme';

export default function AuthLayout() {
  const { user } = useAuth();
  if (user) return <Redirect href={homePath(user)} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
