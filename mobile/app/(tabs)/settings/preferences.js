import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { api } from '../../../src/api';
import { type } from '../../../src/theme';
import { Button, Chip, ErrorText, PageHeading, Screen, SectionLabel } from '../../../src/ui';
import { useSettingsDraft } from '../../../src/useSettings';

/** 08 · Customize preferences: interests feed the recommender (AI-01). */
export default function Preferences() {
  const router = useRouter();
  const { onboarding } = useLocalSearchParams();
  const [cats, setCats] = useState([]);
  const { draft, setDraft, save, saving, error } = useSettingsDraft((u) => new Set(u.interests || []));

  useEffect(() => { api.categories().then(setCats).catch(() => {}); }, []);

  const toggle = (k) => setDraft((d) => {
    const next = new Set(d);
    next.has(k) ? next.delete(k) : next.add(k);
    return next;
  });

  const apply = async () => {
    if (await save((d) => ({ interests: [...d] }))) {
      onboarding ? router.replace('/discover') : router.back();
    }
  };

  return (
    <Screen>
      {onboarding ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={type.eyebrow}>WELCOME TO HOOTY HACK</Text>
          <Text style={[type.h1, { marginTop: 6 }]}>What are you into?</Text>
          <Text style={[type.body, { marginTop: 6 }]}>
            Pick a few interests so your Discover feed starts out personal. You can change these anytime.
          </Text>
        </View>
      ) : (
        <PageHeading title="Customize preferences"
          subtitle="Tell Hooty what you’re into. Your swipes fine-tune these over time." />
      )}
      <SectionLabel>EVENT TYPES</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cats.map((c) => <Chip key={c.key} label={c.label} active={draft.has(c.key)} onPress={() => toggle(c.key)} />)}
      </View>
      <Text style={[type.small, { marginTop: 12 }]}>
        {draft.size ? `${draft.size} selected` : 'Nothing selected: Discover will show what’s coming up soonest.'}
      </Text>
      <ErrorText>{error}</ErrorText>
      <Button title={onboarding ? 'Start discovering  →' : 'Apply preferences'} onPress={apply} loading={saving}
        style={{ marginTop: 24 }} />
      {onboarding ? (
        <Button title="Skip for now" variant="ghost" onPress={() => router.replace('/discover')} style={{ marginTop: 6 }} />
      ) : null}
    </Screen>
  );
}
