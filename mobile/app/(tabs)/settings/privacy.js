import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { type } from '../../../src/theme';
import { Button, Card, ErrorText, PageHeading, Screen, SectionLabel, ToggleRow } from '../../../src/ui';
import { useSettingsDraft } from '../../../src/useSettings';

/** 13 · Privacy & permissions */
export default function Privacy() {
  const router = useRouter();
  const { draft, setDraft, save, saving, error } = useSettingsDraft((u) => ({ ...u.settings }));
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Screen>
      <PageHeading title="Privacy & permissions"
        subtitle="You’re in control of what you share and what the app can access." />
      <SectionLabel>DEVICE PERMISSIONS</SectionLabel>
      <Card>
        <ToggleRow title="Location access"
          subtitle={draft.location_access ? 'Allowed · Suggest events near you.' : 'Not allowed · Choose your campus manually.'}
          value={draft.location_access} onValueChange={set('location_access')} />
        <ToggleRow title="Calendar access"
          subtitle={draft.calendar_access ? 'Allowed · Add saved events to your calendar.' : 'Not allowed'}
          value={draft.calendar_access} onValueChange={set('calendar_access')} last />
      </Card>
      <Text style={[type.small, { marginTop: 8 }]}>Manage device permissions in your phone’s settings.</Text>

      <SectionLabel>YOUR PRIVACY</SectionLabel>
      <Card>
        <ToggleRow title="Usage analytics" subtitle="Share usage data to help improve the app."
          value={draft.usage_analytics} onValueChange={set('usage_analytics')} last />
      </Card>
      <Text style={[type.small, { marginTop: 8, marginBottom: 20 }]}>
        Recommendations only use your interests, campus, and swipes in Hooty Swipe. Nothing is shared with clubs.
      </Text>
      <ErrorText>{error}</ErrorText>
      <Button title="Save privacy settings" loading={saving} onPress={async () => {
        const { location_access, calendar_access, usage_analytics } = draft;
        if (await save(() => ({ settings: { location_access, calendar_access, usage_analytics } }))) router.back();
      }} />
    </Screen>
  );
}
