import { Redirect, Stack } from 'expo-router';

import { isManager, useAuth } from '../../src/auth';
import { colors } from '../../src/theme';

export default function AdminLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/sign-in" />;
  if (!isManager(user)) return <Redirect href="/discover" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
