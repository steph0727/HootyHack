import { useState } from 'react';
import { Text } from 'react-native';

import { api } from '../../../src/api';
import { colors, type } from '../../../src/theme';
import { Button, ErrorText, Field, PageHeading, Screen, SectionLabel } from '../../../src/ui';
import { useSettingsDraft } from '../../../src/useSettings';

/** 11 · Profile & password */
export default function Profile() {
  const { user, draft, setDraft, save, saving, message, error } = useSettingsDraft((u) => u.full_name);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwState, setPwState] = useState({ busy: false, error: '', ok: '' });

  const changePassword = async () => {
    if (pw.next.length < 8) return setPwState({ busy: false, error: 'New password needs at least 8 characters.', ok: '' });
    setPwState({ busy: true, error: '', ok: '' });
    try {
      await api.changePassword({ current_password: pw.current, new_password: pw.next });
      setPw({ current: '', next: '' });
      setPwState({ busy: false, error: '', ok: 'Password updated.' });
    } catch (e) {
      setPwState({ busy: false, error: e.message, ok: '' });
    }
  };

  return (
    <Screen>
      <PageHeading title="Profile & password" subtitle="Keep your details up to date and your account secure." />
      <SectionLabel>PROFILE DETAILS</SectionLabel>
      <Field label="Full name" value={draft} onChangeText={setDraft} autoCapitalize="words" />
      <Field label="KSU email" value={user.email} editable={false} hint="Your KSU email can’t be changed." />
      <ErrorText>{error}</ErrorText>
      {message ? <Text style={[type.small, { color: colors.success, marginBottom: 10 }]}>{message}</Text> : null}
      <Button title="Save profile" onPress={() => save((n) => ({ full_name: n }))} loading={saving} />

      <SectionLabel>PASSWORD</SectionLabel>
      <Field label="Current password" secure value={pw.current} onChangeText={(v) => setPw((p) => ({ ...p, current: v }))}
        autoComplete="current-password" />
      <Field label="New password" secure placeholder="At least 8 characters" value={pw.next}
        onChangeText={(v) => setPw((p) => ({ ...p, next: v }))} autoComplete="new-password" />
      <ErrorText>{pwState.error}</ErrorText>
      {pwState.ok ? <Text style={[type.small, { color: colors.success, marginBottom: 10 }]}>{pwState.ok}</Text> : null}
      <Button title="Update password" variant="outline" onPress={changePassword} loading={pwState.busy} />
    </Screen>
  );
}
