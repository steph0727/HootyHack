import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '../../../src/api';
import { isManager, roleLabel, useAuth } from '../../../src/auth';
import { colors, radius, type } from '../../../src/theme';
import { Button, Card, ErrorText, LinkRow, Screen, SectionLabel, ToggleRow } from '../../../src/ui';

export default function Settings() {
  const router = useRouter();
  const { user, setUser, signOut } = useAuth();
  const [error, setError] = useState('');
  const [cats, setCats] = useState(null);

  useEffect(() => { api.categories().then(setCats).catch(() => setCats([])); }, []);
  const labels = (user.interests || []).map((k) => cats?.find((c) => c.key === k)?.label || k);
  const interestSummary = labels.length
    ? labels.slice(0, 3).join(', ') + (labels.length > 3 ? ` +${labels.length - 3}` : '')
    : 'Pick what you’re into';

  const toggleUpcoming = async (v) => {
    setError('');
    setUser({ ...user, settings: { ...user.settings, upcoming_only: v } });
    try { setUser(await api.updateMe({ settings: { upcoming_only: v } })); } catch (e) { setError(e.message); setUser(user); }
  };

  return (
    <Screen>
      <Text style={type.eyebrow}>HOOTY SWIPE</Text>
      <Text style={[type.h1, { marginTop: 4 }]}>Settings</Text>

      <View style={st.profile}>
        <View style={st.avatar}><Text style={st.avatarText}>{initials(user.full_name)}</Text></View>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={st.name} numberOfLines={1}>{user.full_name}</Text>
          <Text style={st.email} numberOfLines={1}>{user.email}</Text>
        </View>
        <View style={st.role}><Text style={st.roleText}>{roleLabel(user)}</Text></View>
      </View>

      <ErrorText>{error}</ErrorText>

      {isManager(user) ? (
        <>
          <SectionLabel>{user.role === 'club' ? 'CLUB' : 'ADMIN'}</SectionLabel>
          <Card>
            <LinkRow title={user.role === 'club' ? 'Club dashboard' : 'Manage events'}
              subtitle={user.role === 'club' ? `Create and edit events for ${user.club_name}` : 'Create and edit event information'}
              onPress={() => router.push('/admin')} last />
          </Card>
        </>
      ) : null}

      <SectionLabel>DISCOVERY PREFERENCES</SectionLabel>
      <Card>
        <LinkRow title="Interests" subtitle={interestSummary} onPress={() => router.push('/settings/preferences')} />
        <LinkRow title="Campus" subtitle={user.campus === 'Both' ? 'Both campuses' : `${user.campus} campus`}
          onPress={() => router.push('/settings/campus')} />
        <ToggleRow title="Upcoming events only" subtitle="Hide events that have already started."
          value={user.settings?.upcoming_only} onValueChange={toggleUpcoming} last />
      </Card>

      <SectionLabel>ACCOUNT & NOTIFICATIONS</SectionLabel>
      <Card>
        <LinkRow title="Profile & password" onPress={() => router.push('/settings/profile')} />
        <LinkRow title="Event reminders" onPress={() => router.push('/settings/reminders')} />
        <LinkRow title="Privacy & permissions" onPress={() => router.push('/settings/privacy')} last />
      </Card>

      <Button title="Sign out" variant="outline" style={{ marginTop: 28 }} onPress={signOut} />
      <Text style={[type.small, { textAlign: 'center', marginTop: 18 }]}>Hooty Swipe  ·  Made for Owls</Text>
    </Screen>
  );
}

const initials = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

const st = StyleSheet.create({
  profile: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.black, borderRadius: radius.lg,
    padding: 16, marginTop: 18,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.gold, alignItems: 'center',
    justifyContent: 'center', marginRight: 14,
  },
  avatarText: { fontWeight: '900', fontSize: 17, color: colors.black },
  name: { color: '#FFF', fontWeight: '800', fontSize: 17 },
  email: { color: '#BDBDBD', fontSize: 13, marginTop: 2 },
  role: { backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  roleText: { fontWeight: '800', fontSize: 12, color: colors.black },
});
