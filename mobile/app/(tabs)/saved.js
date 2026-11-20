import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../../src/api';
import { roleLabel, useAuth } from '../../src/auth';
import { colors, fmt, fmtTime, radius, type } from '../../src/theme';
import { Button, Card, ErrorText, Loading, Screen } from '../../src/ui';

export default function Saved() {
  const router = useRouter();
  const { user } = useAuth();
  const [events, setEvents] = useState(null);
  const [tab, setTab] = useState('upcoming');
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    api.saved().then(setEvents).catch((e) => { setError(e.message); setEvents((p) => p || []); });
  }, []));

  const remove = async (ev) => {
    const before = events;
    setEvents((list) => list.filter((e) => e.id !== ev.id));
    try { await api.unsave(ev.id); } catch (e) { setError(e.message); setEvents(before); }
  };

  if (events === null) return <Screen scroll={false}><Loading /></Screen>;

  const upcoming = events.filter((e) => !e.is_past);
  const past = events.filter((e) => e.is_past).reverse();
  const list = tab === 'upcoming' ? upcoming : past;
  const next = upcoming[0];

  return (
    <Screen>
      <View style={st.headRow}>
        <Text style={type.eyebrow}>YOUR CAMPUS, YOUR PLANS</Text>
        <View style={st.role}><Text style={st.roleText}>{roleLabel(user)}</Text></View>
      </View>
      <Text style={[type.h1, { marginTop: 4 }]}>Saved events</Text>
      <Text style={[type.body, { marginTop: 4 }]}></Text>

      <View style={st.summary} accessibilityLabel="Saved event summary">
        <Text style={[type.eyebrow, { color: colors.gold }]}>YOUR SAVED LINEUP</Text>
        <View style={st.metrics}>
          <View style={{ flex: 1 }}>
            <Text style={st.metricBig}>{String(upcoming.length).padStart(2, '0')}</Text>
            <Text style={st.metricLabel}>Saved events</Text>
          </View>
          <View style={st.metricDivider} />
          <View style={{ flex: 1, paddingLeft: 18 }}>
            <Text style={st.metricBig}>{next ? `${fmt.day(next.starts_at)} ${fmt.month(next.starts_at)}` : '—'}</Text>
            <Text style={st.metricLabel}>Next event</Text>
          </View>
        </View>
      </View>

      <ErrorText>{error}</ErrorText>

      <View style={st.listHead}>
        <Text style={type.h2}>Your lineup</Text>
        <Text style={type.small}>Approaching</Text>
      </View>
      <View style={st.tabs} accessibilityRole="tablist">
        {[['upcoming', 'Upcoming', upcoming.length], ['past', 'Past', past.length]].map(([k, label, n]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[st.tab, tab === k && st.tabOn]}
            accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Text style={[st.tabText, tab === k && { color: colors.gold }]}>{label}  {n}</Text>
          </Pressable>
        ))}
      </View>

      {list.length === 0 ? (
        <Card style={{ paddingVertical: 28, alignItems: 'center' }}>
          <Text style={[type.body, { textAlign: 'center' }]}>
            {tab === 'upcoming' ? 'Nothing saved yet. Swipe right on an event to add it here.' : 'No past events yet.'}
          </Text>
        </Card>
      ) : list.map((ev) => (
        <View key={ev.id} style={[st.item, ev.is_past && { opacity: 0.6 }]}>
          <Pressable onPress={() => router.push(`/event/${ev.id}`)} style={st.itemMain}
            accessibilityRole="button" accessibilityLabel={`View event ${ev.name}`}>
          <View style={st.date} accessibilityLabel="Event date">
            <Text style={st.dateDay}>{fmt.day(ev.starts_at)}</Text>
            <Text style={st.dateMonth}>{fmt.month(ev.starts_at)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.itemTitle} numberOfLines={2}>{ev.name}</Text>
            <Text style={type.small}>{fmtTime(ev.starts_at)} · {ev.campus} campus</Text>
            <Text style={st.view}>View event</Text>
          </View>
          </Pressable>
          <Pressable onPress={() => remove(ev)} hitSlop={10} style={st.remove}
            accessibilityRole="button" accessibilityLabel={`Remove ${ev.name} from saved`}>
            <Feather name="heart" size={20} color={colors.danger} />
          </Pressable>
        </View>
      ))}

      <Button title="Discover more events  →" variant="gold" style={{ marginTop: 18 }} onPress={() => router.push('/discover')} />
    </Screen>
  );
}

const st = StyleSheet.create({
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  role: { backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  roleText: { fontWeight: '800', fontSize: 12, color: colors.ink },
  summary: { backgroundColor: colors.black, borderRadius: radius.lg, padding: 20, marginTop: 20, marginBottom: 8 },
  metrics: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  metricBig: { color: '#FFF', fontSize: 30, fontWeight: '900' },
  metricLabel: { color: '#BDBDBD', fontSize: 13, marginTop: 2 },
  metricDivider: { width: 1, alignSelf: 'stretch', backgroundColor: '#333' },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22 },
  tabs: { flexDirection: 'row', gap: 8, marginVertical: 14 },
  tab: { paddingHorizontal: 16, height: 36, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  tabOn: { backgroundColor: colors.black, borderColor: colors.black },
  tabText: { fontWeight: '800', color: colors.ink },
  item: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.line,
  },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  date: {
    width: 56, height: 62, borderRadius: 14, backgroundColor: colors.gold, alignItems: 'center',
    justifyContent: 'center', marginRight: 14,
  },
  dateDay: { fontSize: 22, fontWeight: '900', color: colors.black },
  dateMonth: { fontSize: 11, fontWeight: '800', color: colors.black, letterSpacing: 1 },
  itemTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 3 },
  view: { fontSize: 13, fontWeight: '800', color: colors.ink, textDecorationLine: 'underline', marginTop: 6 },
  remove: { padding: 8 },
});
