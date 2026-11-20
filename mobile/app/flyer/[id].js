import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { colors } from '../../src/theme';
import { Button, Flyer, Loading } from '../../src/ui';

/** "03 · Flyer close up": the flyer on its own, full screen. */
export default function FlyerCloseUp() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/sign-in" />;
  return <FlyerCloseUpScreen />;
}

function FlyerCloseUpScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [ev, setEv] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api.event(id).then(setEv).catch((e) => setError(e.message)); }, [id]);

  return (
    <SafeAreaView style={st.screen} edges={['top', 'left', 'right']}>
      <View style={st.bar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/discover'))}
          style={st.close} accessibilityRole="button" accessibilityLabel="Close flyer">
          <Feather name="x" size={22} color="#FFF" />
        </Pressable>
        {ev ? <Text style={st.title} numberOfLines={1}>{ev.name}</Text> : null}
      </View>
      {error ? <Text style={st.error}>{error}</Text> : !ev ? <Loading /> : (
        <>
          <Flyer event={ev} style={st.flyer} resizeMode="contain" />
          <View style={st.actions}>
            {ev.flyer_type === 'pdf' ? (
              <Button title="Open PDF" variant="primary" icon="file-text" style={st.outline}
                onPress={() => WebBrowser.openBrowserAsync(ev.flyer_url)} />
            ) : null}
            <Button title="Event details" variant="gold" style={{ flex: 1 }} onPress={() => router.push(`/event/${ev.id}`)} />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  bar: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  close: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFF', fontWeight: '800', fontSize: 16, marginLeft: 12, flex: 1 },
  flyer: { flex: 1, width: '100%', backgroundColor: colors.black },
  actions: { flexDirection: 'row', gap: 10, padding: 16, width: '100%', maxWidth: 520, alignSelf: 'center' },
  outline: { flex: 1, borderWidth: 1.5, borderColor: colors.gold },
  error: { color: '#FFF', padding: 20 },
});
