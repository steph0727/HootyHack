import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { colors, radius, type } from '../../../src/theme';
import { Button, Card, Chip, ErrorText, PageHeading, Screen, SectionLabel, ToggleRow } from '../../../src/ui';
import { useSettingsDraft } from '../../../src/useSettings';

/** 12 · Event reminders (preferences are stored; delivery is a future enhancement). */
export default function Reminders() {
  const router = useRouter();
  const { draft, setDraft, save, saving, error } = useSettingsDraft((u) => ({ ...u.settings }));
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Screen>
      <PageHeading title="Event reminders" subtitle="Get a heads-up before the events you save." />
      <SectionLabel>NOTIFICATIONS</SectionLabel>
      <Card>
        <ToggleRow title="Push reminders" subtitle="Get a notification on this device."
          value={draft.push_reminders} onValueChange={set('push_reminders')} />
        <ToggleRow title="Email reminders" subtitle="Send reminders to your student email."
          value={draft.email_reminders} onValueChange={set('email_reminders')} last />
      </Card>
      <SectionLabel>REMIND ME BEFORE</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {['15 min', '1 hour', '1 day'].map((o) => (
          <Chip key={o} label={o} active={draft.reminder_lead === o} onPress={() => set('reminder_lead')(o)} />
        ))}
      </View>
      <Card style={{ marginTop: 14 }}>
        <ToggleRow title="Quiet hours" subtitle="Pause alerts from 10 PM to 8 AM."
          value={draft.quiet_hours} onValueChange={set('quiet_hours')} last />
      </Card>
      <View style={{ backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: 16, marginVertical: 18 }}>
        <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 4 }}>Only the events you save.</Text>
        <Text style={type.small}>Reminders follow your saved events. Remove an event from Saved to stop its reminder.</Text>
      </View>
      <ErrorText>{error}</ErrorText>
      <Button title="Save reminders" loading={saving} onPress={async () => {
        const { push_reminders, email_reminders, reminder_lead, quiet_hours } = draft;
        if (await save(() => ({ settings: { push_reminders, email_reminders, reminder_lead, quiet_hours } }))) router.back();
      }} />
    </Screen>
  );
}
