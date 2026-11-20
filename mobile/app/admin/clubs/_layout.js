import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../../src/auth';
import { colors } from '../../../src/theme';

/** Club-account management is admin-only (the API enforces this too). */
export default function ClubsLayout() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Redirect href="/admin" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
