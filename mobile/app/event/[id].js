import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { colors, fmt, fmtRange, radius, type } from '../../src/theme';
import { Button, CategoryTag, Chip, ErrorText, Flyer, Loading, Screen } from '../../src/ui';

export default function EventInformation() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/sign-in" />;
  return <EventInformationScreen />;
}

function EventInformationScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [ev, setEv] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [allCats, setAllCats] = useState([]);
  const [fixing, setFixing] = useState(false);
  const [thanks, setThanks] = useState('');

  useFocusEffect(useCallback(() => {
    setError('');
    api.event(id).then(setEv).catch((e) => setError(e.message));
  }, [id]));
  useEffect(() => { api.categories().then(setAllCats).catch(() => {}); }, []);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/saved'));

  if (error && !ev) {
    return (
      <Screen>
        <Pressable onPress={goBack} style={st.iconBtn} accessibilityLabel="Back"><Feather name="arrow-left" size={22} color={colors.ink} /></Pressable>
        <ErrorText>{error}</ErrorText>
      </Screen>
    );
  }
  if (!ev) return <Screen scroll={false}><Loading /></Screen>;

  const toggleSave = async () => {
    setBusy(true);
    try {
      ev.is_saved ? await api.unsave(ev.id) : await api.save(ev.id);
      setEv({ ...ev, is_saved: !ev.is_saved });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const open = (url) => WebBrowser.openBrowserAsync(url).catch(() => setError('Could not open that link.'));

  const share = () => Share.share({
    message: `${ev.name} · ${fmt.longDay(ev.starts_at)}, ${fmtRange(ev.starts_at, ev.ends_at)} · ${ev.location || ''} ${ev.owl_life_url || ''}`,
  }).catch(() => {});

  const feedback = async (key, correct) => {
    try {
      await api.categoryFeedback(ev.id, key, correct);
      setEv(await api.event(ev.id));
      setThanks('Thanks! Hooty learns from your corrections.');
      setFixing(false);
    } catch (e) { setError(e.message); }
  };

  const catKeys = new Set(ev.categories.map((c) => c.key));

  return (
    <Screen>
      <View style={st.topBar}>
        <Pressable onPress={goBack} style={st.iconBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.ink} />
        </Pressable>
        <Text style={st.topTitle}>Event details</Text>
        <Pressable onPress={share} style={st.iconBtn} accessibilityRole="button" accessibilityLabel="Share event">
          <Feather name="share" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <Pressable onPress={() => router.push(`/flyer/${ev.id}`)} accessibilityLabel="View flyer close up">
        <Flyer event={ev} style={st.flyer} />
      </Pressable>

      <View style={st.tags}>
        {ev.categories[0] ? <CategoryTag label={ev.categories[0].label} /> : null}
        {ev.is_free ? <View style={st.free}><Text style={st.freeText}>Free event</Text></View> : null}
        {ev.is_past ? <View style={st.free}><Text style={st.freeText}>Ended</Text></View> : null}
        {ev.is_ongoing ? <View style={[st.free, { backgroundColor: colors.gold }]}><Text style={st.freeText}>Happening now</Text></View> : null}
      </View>
      <Text style={type.h1}>{ev.name}</Text>
      <Text style={[type.body, { marginTop: 4, fontWeight: '700' }]}>Hosted by {ev.host_organization}</Text>

      <View style={st.details}>
        <DetailRow icon="clock" title={fmt.longDay(ev.starts_at)} sub={fmtRange(ev.starts_at, ev.ends_at)} />
        <DetailRow icon="map-pin" title={`${ev.campus} campus`} sub={ev.location || 'Location to be announced'} />
      </View>

      <Text style={type.h2}>About</Text>
      <Text style={[type.body, { marginTop: 8 }]}>{ev.description || 'The host hasn’t added a description yet.'}</Text>

      <ErrorText>{error}</ErrorText>

      <View style={st.rsvpBox}>
        <Text style={[type.eyebrow, { color: colors.ink }]}>RSVP</Text>
        <Text style={[type.small, { marginTop: 4, marginBottom: 14 }]}>
          Saving an event is not an RSVP. Register on the host’s page to save your spot.
        </Text>
        {ev.rsvp_url ? (
          <Button title="RSVP on Owl Life" icon="external-link" onPress={() => open(ev.rsvp_url)} disabled={ev.is_past} />
        ) : (
          <Text style={[type.body, { fontWeight: '700' }]}>No registration needed. Just show up!</Text>
        )}
        {ev.owl_life_url ? (
          <Button title="View on Owl Life" variant="ghost" onPress={() => open(ev.owl_life_url)} style={{ marginTop: 4 }} />
        ) : null}
        {ev.flyer_type === 'pdf' && ev.flyer_url ? (
          <Button title="Open PDF flyer" variant="ghost" icon="file-text" onPress={() => open(ev.flyer_url)} />
        ) : null}
      </View>

      <Button
        title={ev.is_saved ? 'Remove from saved' : 'Save event'}
        icon="heart"
        variant={ev.is_saved ? 'danger' : 'gold'}
        onPress={toggleSave}
        loading={busy}
        style={{ marginTop: 14 }}
      />

      <View style={st.aiBox}>
        <Text style={[type.eyebrow, { marginBottom: 10 }]}>CATEGORIES · SORTED BY HOOTY AI</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {ev.categories.map((c) => (
            <Chip key={c.key} label={`${c.label}${c.source === 'ai' ? ` ${Math.round(c.confidence * 100)}%` : ''}`}
              icon={fixing ? 'x' : undefined} onPress={fixing ? () => feedback(c.key, false) : undefined} />
          ))}
        </View>
        {fixing ? (
          <>
            <Text style={[type.small, { marginVertical: 8 }]}>Tap ✕ on a wrong category, or add one that fits:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {allCats.filter((c) => !catKeys.has(c.key)).map((c) => (
                <Chip key={c.key} label={`+ ${c.label}`} onPress={() => feedback(c.key, true)} />
              ))}
            </View>
          </>
        ) : (
          <Pressable onPress={() => { setFixing(true); setThanks(''); }} accessibilityRole="button">
            <Text style={st.fix}>{thanks || 'Not quite right? Suggest a category'}</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

function DetailRow({ icon, title, sub }) {
  return (
    <View style={st.detailRow}>
      <View style={st.detailIcon}><Feather name={icon} size={18} color={colors.black} /></View>
      <View style={{ flex: 1 }}>
        <Text style={st.detailTitle}>{title}</Text>
        <Text style={type.small}>{sub}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  topTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  flyer: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.lg, overflow: 'hidden' },
  tags: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 10, flexWrap: 'wrap' },
  free: { backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  freeText: { fontSize: 11, fontWeight: '800', color: colors.ink },
  details: {
    marginVertical: 20, paddingVertical: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  detailIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center',
    justifyContent: 'center', marginRight: 14,
  },
  detailTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  rsvpBox: {
    marginTop: 22, padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1,
    borderColor: colors.line,
  },
  aiBox: { marginTop: 26, padding: 16, borderRadius: radius.lg, backgroundColor: '#F3EEE2' },
  fix: { fontWeight: '700', color: colors.ink, textDecorationLine: 'underline', marginTop: 6 },
});
