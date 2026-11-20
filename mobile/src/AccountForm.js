import { useState } from 'react';
import { Text } from 'react-native';

import { useAuth } from './auth';
import { colors, type } from './theme';
import { Button, ErrorText, Field, SectionLabel } from './ui';
import { useSettingsDraft } from './useSettings';

/** Profile details + password change. Used by Settings › Profile and the admin/club Account screen. */
export function AccountForm() {
  const { changePassword } = useAuth();
  const { user, draft, setDraft, save, saving, message, error } = useSettingsDraft((u) => u.full_name);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwState, setPwState] = useState({ busy: false, error: '', ok: '' });

  const submitPassword = async () => {
    if (pw.next.length < 8) return setPwState({ busy: false, error: 'New password needs at least 8 characters.', ok: '' });
    setPwState({ busy: true, error: '', ok: '' });
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: '', next: '' });
      setPwState({ busy: false, error: '', ok: 'Password updated. Other devices will need to sign in again.' });
    } catch (e) {
      setPwState({ busy: false, error: e.message, ok: '' });
    }
  };

  return (
    <>
      <SectionLabel>PROFILE DETAILS</SectionLabel>
      <Field label="Full name" value={draft} onChangeText={setDraft} autoCapitalize="words" />
      <Field label={user.role === 'student' ? 'KSU email' : 'Email'} value={user.email} editable={false}
        hint={user.role === 'club' ? 'Ask an Owl Life admin to change your sign-in email.' : 'Your KSU email can’t be changed.'} />
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
      <Button title="Update password" variant="outline" onPress={submitPassword} loading={pwState.busy} />
    </>
  );
}
