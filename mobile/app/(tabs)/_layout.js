import { Feather } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '../../src/auth';
import { colors } from '../../src/theme';

const icon = (name) => ({ color }) => <Feather name={name} size={22} color={color} />;

export default function TabsLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/sign-in" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.black,
        tabBarInactiveTintColor: '#9A9486',
        tabBarActiveBackgroundColor: colors.goldSoft,
        tabBarLabelStyle: { fontWeight: '800', fontSize: 12 },
        tabBarItemStyle: { borderRadius: 16, marginHorizontal: 6, marginVertical: 6 },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 78, paddingBottom: 10 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: icon('compass') }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved', tabBarIcon: icon('heart') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings') }} />
    </Tabs>
  );
}
