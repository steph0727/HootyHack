import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../../../src/api';
import { colors, radius, type } from '../../../src/theme';
import { Button, ErrorText, Loading, PageHeading, Screen } from '../../../src/ui';

/** Admin: club accounts. Each one lets a club sign in and manage its own events. */
export default function ClubAccounts() {
  const router = useRouter();
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    setError('');
    api.clubAccounts()
      .then(setAccounts)
      .catch((e) => { setError(e.message); setAccounts((p) => p || []); });
  }, []));

  return (
    <Screen>
      <PageHeading
        title="Club accounts"
        subtitle="Give a club its own sign-in. It can post and edit only its own events."
        backLabel="Events"
      />
      <Button title="New club account" icon="user-plus" style={{ marginTop: 10 }}
        onPress={() => router.push('/admin/clubs/new')} />

      <ErrorText>{error}</ErrorText>

      {accounts === null ? <View style={{ height: 200 }}><Loading /></View> : accounts.length === 0 ? (
        <Text style={[type.body, { textAlign: 'center', marginTop: 32 }]}>
          No club accounts yet. Create one so a club can post its own events.
        </Text>
      ) : accounts.map((a) => (
        <Pressable key={a.id} style={st.row} onPress={() => router.push(`/admin/clubs/${a.id}`)}
          accessibilityRole="button" accessibilityLabel={`${a.club_name}, ${a.full_name}`}>
          <View style={st.avatar}><Feather name="users" size={18} color={colors.gold} /></View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={st.name} numberOfLines={1}>{a.club_name}</Text>
            <Text style={st.meta} numberOfLines={1}>{a.full_name} · {a.email}</Text>
            <Text style={st.meta}>{a.event_count} event{a.event_count === 1 ? '' : 's'}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.muted} />
        </Pressable>
      ))}
    </Screen>
  );
}

const st = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, padding: 14, marginTop: 10,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.black, alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 16, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
