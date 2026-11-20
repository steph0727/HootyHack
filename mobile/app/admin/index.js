import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { colors, fmt, fmtRange, radius, type } from '../../src/theme';
import { Button, Chip, ErrorText, Loading, Screen } from '../../src/ui';

const TABS = [['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']];

export default function AdminEvents() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const isClub = user.role === 'club';
  const [events, setEvents] = useState(null);
  const [when, setWhen] = useState('upcoming');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(() => {
    setError('');
    api.adminEvents({ q: query, when })
      .then(setEvents)
      .catch((e) => { setError(e.message); setEvents((p) => p || []); });
  }, [query, when]);

  useFocusEffect(load);

  return (
    <Screen>
      <View style={st.headRow}>
        <Text style={[type.eyebrow, { flex: 1, marginRight: 8 }]} numberOfLines={1}>
          {isClub ? user.club_name.toUpperCase() : 'OWL LIFE ADMIN'}
        </Text>
        <View style={st.role}><Text style={st.roleText}>{isClub ? 'Club' : 'Admin'}</Text></View>
      </View>
      <Text style={[type.h1, { marginTop: 4 }]}>{isClub ? 'Your events' : 'Manage events'}</Text>
      <Text style={[type.body, { marginTop: 4 }]}>
        {isClub ? `Post events for ${user.club_name} and keep their details up to date.`
          : 'Create events and keep their details up to date.'}
      </Text>

      <Button title="New event" icon="plus" style={{ marginTop: 18 }} onPress={() => router.push('/admin/new')} />
      {!isClub ? (
        <Button title="Club accounts" icon="users" variant="outline" style={{ marginTop: 10 }}
          onPress={() => router.push('/admin/clubs')} />
      ) : null}

      <View style={st.search}>
        <Feather name="search" size={18} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={isClub ? 'Search by name or location' : 'Search by name, host or location'}
          placeholderTextColor="#A39E92"
          style={st.searchInput}
          autoCapitalize="none"
          accessibilityLabel="Search events"
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Clear search">
            <Feather name="x" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <View style={st.tabs}>
        {TABS.map(([key, label]) => (
          <Chip key={key} label={label} active={when === key} onPress={() => { setEvents(null); setWhen(key); }} />
        ))}
      </View>

      <ErrorText>{error}</ErrorText>

      {events === null ? <View style={{ height: 200 }}><Loading /></View> : events.length === 0 ? (
        <Text style={[type.body, { textAlign: 'center', marginTop: 32 }]}>
          {query ? 'No events match that search.' : isClub && when !== 'past' ? 'No upcoming events yet. Tap New event to post one.' : 'No events here yet.'}
        </Text>
      ) : events.map((ev) => (
        <Pressable key={ev.id} style={st.row} onPress={() => router.push(`/admin/${ev.id}`)} accessibilityRole="button">
          <Thumb event={ev} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={st.name} numberOfLines={2}>{ev.name}</Text>
            {!isClub ? <Text style={st.meta} numberOfLines={1}>{ev.host_organization}</Text> : null}
            <Text style={st.meta} numberOfLines={1}>
              {fmt.shortDay(ev.starts_at)} · {fmtRange(ev.starts_at, ev.ends_at)} · {ev.campus}
            </Text>
            <View style={st.badges}>
              {ev.is_ongoing ? <Badge label="Happening now" gold /> : ev.is_past ? <Badge label="Ended" /> : null}
              <Badge label={`${ev.saves} saved`} />
              {ev.categories.slice(0, 2).map((c) => <Badge key={c.key} label={c.label} />)}
            </View>
          </View>
          <Feather name="edit-2" size={18} color={colors.muted} />
        </Pressable>
      ))}

      <View style={st.footer}>
        <Button title="View student app" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/discover')} />
        <Button title="Account" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/admin/account')} />
      </View>
      <Button title="Sign out" variant="ghost" style={{ marginTop: 6 }} onPress={signOut} />
    </Screen>
  );
}

function Thumb({ event }) {
  const [failed, setFailed] = useState(false);
  const uri = event.flyer_type === 'pdf' ? event.flyer_preview_url : event.flyer_url;
  if (!uri || failed) {
    return <View style={[st.thumb, st.thumbEmpty]}><Feather name="image" size={20} color={colors.gold} /></View>;
  }
  return <Image source={{ uri }} style={st.thumb} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />;
}

function Badge({ label, gold }) {
  return (
    <View style={[st.badge, gold && { backgroundColor: colors.gold }]}>
      <Text style={st.badgeText}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  role: { backgroundColor: colors.black, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  roleText: { fontWeight: '800', fontSize: 12, color: colors.gold },
  search: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1.5,
    borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, height: 50, marginTop: 18,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.ink, marginLeft: 10, height: '100%', outlineStyle: 'none' },
  tabs: { flexDirection: 'row', marginTop: 14, marginBottom: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, padding: 12, marginTop: 10,
  },
  thumb: { width: 64, height: 86, borderRadius: radius.sm, backgroundColor: colors.line },
  thumbEmpty: { backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  badge: {
    backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3,
    marginRight: 6, marginTop: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.ink },
  footer: { flexDirection: 'row', gap: 10, marginTop: 28 },
});
