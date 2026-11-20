import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, type } from '../../../src/theme';
import { Button, ErrorText, PageHeading, Screen, SectionLabel } from '../../../src/ui';
import { useSettingsDraft } from '../../../src/useSettings';

const OPTIONS = [
  ['Kennesaw', 'Events on the Kennesaw campus'],
  ['Marietta', 'Events on the Marietta campus'],
  ['Both', 'Events on both campuses'],
];

/** 09 · Campus */
export default function Campus() {
  const router = useRouter();
  const { draft, setDraft, save, saving, error } = useSettingsDraft((u) => u.campus);

  return (
    <Screen>
      <PageHeading title="Campus" subtitle="Pick your go-to campus. You can change this whenever you like." />
      <SectionLabel>YOUR CAMPUS</SectionLabel>
      {OPTIONS.map(([key, sub]) => {
        const on = draft === key;
        return (
          <Pressable key={key} onPress={() => setDraft(key)} style={[st.opt, on && st.optOn]}
            accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <View style={{ flex: 1 }}>
              <Text style={[st.title, on && { color: colors.gold }]}>{key === 'Both' ? 'Both campuses' : key}</Text>
              <Text style={[type.small, on && { color: '#CFCFCF' }]}>{sub}</Text>
            </View>
            <View style={[st.radio, on && st.radioOn]}>{on ? <View style={st.dot} /> : null}</View>
          </Pressable>
        );
      })}
      <View style={st.note}>
        <Text style={st.noteTitle}>Your campus, your community.</Text>
        <Text style={type.small}>Your Discover feed will prioritize events at your selected campus.</Text>
      </View>
      <ErrorText>{error}</ErrorText>
      <Button title="Save campus" loading={saving} onPress={async () => { if (await save((c) => ({ campus: c }))) router.back(); }} />
    </Screen>
  );
}

const st = StyleSheet.create({
  opt: {
    flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.line, backgroundColor: colors.surface, marginBottom: 10,
  },
  optOn: { backgroundColor: colors.black, borderColor: colors.black },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: 2 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.gold },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.gold },
  note: { backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: 16, marginVertical: 18 },
  noteTitle: { fontWeight: '800', color: colors.ink, marginBottom: 4 },
});
