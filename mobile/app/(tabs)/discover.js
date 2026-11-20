import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import SwipeDeck from '../../src/SwipeDeck';
import { colors, radius, type } from '../../src/theme';
import { Button, Chip, ErrorText, Loading, Screen } from '../../src/ui';

const FILTERS = [
  { key: 'for_you', label: 'For you' },
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
];
const CAMPUS_CYCLE = { Both: 'Kennesaw', Kennesaw: 'Marietta', Marietta: 'Both' };
const campusLabel = (c) => (c === 'Both' ? 'Both campuses' : `${c} campus`);

export default function Discover() {
  const router = useRouter();
  const { user } = useAuth();
  const deck = useRef(null);
  const [filter, setFilter] = useState('for_you');
  const [campus, setCampus] = useState(user?.campus || 'Both');
  const [events, setEvents] = useState(null);
  const [strategy, setStrategy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const loadedKey = useRef('');

  const load = useCallback(async (f = filter, c = campus) => {
    setError('');
    try {
      const res = await api.feed({ filter: f, campus: c });
      setEvents(res.events);
      setStrategy(res.strategy);
      loadedKey.current = `${f}|${c}`;
    } catch (e) {
      setError(e.message);
      setEvents((prev) => prev || []);
    }
  }, [filter, campus]);

  // Reload when the tab regains focus (e.g. after changing preferences) or filters change.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSwipe = (event, direction) => {
    const left = (events?.length || 1) - 1;
    setEvents((list) => list.filter((e) => e.id !== event.id));
    if (direction === 'right') {
      setToast(`Saved “${event.name}”`);
      setTimeout(() => setToast(''), 1800);
    }
    api.swipe(event.id, direction)
      // Top up the queue (after the swipe is recorded) so ranking reflects the newest swipes.
      .then(() => { if (left <= 3) load(); })
      .catch((e) => setError(e.message));
  };

  const changeFilter = (f) => { setFilter(f); setEvents(null); };
  const changeCampus = () => { setCampus((c) => CAMPUS_CYCLE[c]); setEvents(null); };

  return (
    <Screen scroll={false} contentStyle={{ paddingBottom: 12 }}>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={type.eyebrow}>HOOTY HACK</Text>
          <Text style={[type.h1, { marginTop: 4 }]}>Find your next thing.</Text>
        </View>
        <Pressable onPress={() => router.push('/settings/preferences')} style={st.filterBtn}
          accessibilityRole="button" accessibilityLabel="Event filters">
          <Feather name="sliders" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => changeFilter(f.key)} />
        ))}
        <Chip label={campusLabel(campus)} icon="map-pin" onPress={changeCampus} />
      </ScrollView>

      <ErrorText>{error}</ErrorText>

      <View style={{ flex: 1 }}>
        {events === null ? <Loading /> : events.length ? (
          <>
            <View style={st.hintRow}>
              <Text style={st.hint}>← pass</Text>
              <Text style={st.hintCenter}>{strategy === 'fallback' ? 'UPCOMING ON CAMPUS' : 'SWIPE TO DISCOVER'}</Text>
              <Text style={st.hint}>save →</Text>
            </View>
            <SwipeDeck
              ref={deck}
              events={events}
              onSwipe={handleSwipe}
              onOpen={(e) => router.push(`/event/${e.id}`)}
              onOpenFlyer={(e) => router.push(`/flyer/${e.id}`)}
            />
            <View style={st.actions}>
              <Button title="←  Not for me" variant="outline" style={st.actionBtn} onPress={() => deck.current?.swipe('left')} />
              <Button title="I’m interested  →" variant="primary" style={st.actionBtn} onPress={() => deck.current?.swipe('right')} />
            </View>
          </>
        ) : (
          <EmptyDeck filter={filter} onReset={async () => { await api.resetSkips(); setEvents(null); load(); }}
            onSaved={() => router.push('/saved')} onAll={() => { setFilter('for_you'); setCampus('Both'); setEvents(null); }} />
        )}
      </View>
      {toast ? <View style={st.toast}><Text style={st.toastText}>{toast}</Text></View> : null}
      <Text style={[type.small, { textAlign: 'center', marginTop: 8 }]}>Made for your life beyond the classroom.</Text>
    </Screen>
  );
}

function EmptyDeck({ filter, onReset, onSaved, onAll }) {
  return (
    <View style={st.empty}>
      <Text style={{ fontSize: 44 }}>🦉</Text>
      <Text style={[type.h2, { textAlign: 'center', marginTop: 10 }]}>You’re all caught up.</Text>
      <Text style={[type.body, { textAlign: 'center', marginTop: 6, marginBottom: 22 }]}>
        {filter === 'for_you'
          ? 'No more upcoming events right now. Check back soon, or take another look at ones you passed on.'
          : 'Nothing left for this filter. Try a wider view.'}
      </Text>
      {filter !== 'for_you' ? <Button title="Show all upcoming" onPress={onAll} style={{ alignSelf: 'stretch', marginBottom: 10 }} /> : null}
      <Button title="See my saved events" variant="gold" onPress={onSaved} style={{ alignSelf: 'stretch', marginBottom: 10 }} />
      <Button title="Show events I passed on" variant="outline" onPress={onReset} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14 },
  filterBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  hint: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  hintCenter: { fontSize: 11, color: colors.ink, fontWeight: '900', letterSpacing: 1.4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 30 },
  actionBtn: { flex: 1, paddingHorizontal: 8 },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
  },
  toast: {
    position: 'absolute', alignSelf: 'center', top: 150, backgroundColor: colors.black, paddingHorizontal: 18,
    paddingVertical: 10, borderRadius: radius.pill,
  },
  toastText: { color: colors.gold, fontWeight: '800' },
});
