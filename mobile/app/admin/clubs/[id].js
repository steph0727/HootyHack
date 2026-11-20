import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '../../../src/api';
import { colors, radius, type } from '../../../src/theme';
import {
  Button, Card, Chip, ErrorText, Field, Loading, PageHeading, Screen, SectionLabel, confirmAction,
} from '../../../src/ui';

// Matches the server: case-insensitive, extra spaces ignored.
const clubKey = (name) => String(name || '').trim().split(/\s+/).join(' ').toLowerCase();

function suggestPassword() {
  // Readable characters only (no 0/O, 1/l/I) so it's easy to share.
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/** Admin: create or edit a club account ("new" = create). */
export default function ClubAccountForm() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [account, setAccount] = useState(null);       // the saved account (null while creating)
  const [form, setForm] = useState(id === 'new' ? { club_name: '', full_name: '', email: '', password: '' } : null);
  const [clubs, setClubs] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [share, setShare] = useState(null);           // sign-in details to hand to the club, shown once
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isNew = !account;

  useEffect(() => {
    api.clubs().then(setClubs).catch(() => {});
    if (id !== 'new') {
      api.clubAccount(id)
        .then((a) => { setAccount(a); setForm({ club_name: a.club_name, full_name: a.full_name, email: a.email, password: '' }); })
        .catch((e) => setError(e.message));
    }
  }, [id]);

  const set = (k) => (v) => { setNotice(''); setForm((f) => ({ ...f, [k]: v })); };

  const typed = clubKey(form?.club_name);
  const match = clubs.find((c) => clubKey(c.name) === typed);
  const suggestions = useMemo(() => {
    const list = typed ? clubs.filter((c) => clubKey(c.name).includes(typed) && clubKey(c.name) !== typed) : clubs;
    return list.filter((c) => c.event_count > 0).slice(0, 8);
  }, [clubs, typed]);

  const save = async () => {
    setError(''); setNotice('');
    const club_name = form.club_name.trim().split(/\s+/).join(' ');
    const email = form.email.trim().toLowerCase();
    if (club_name.length < 2) return setError("Enter the club's name.");
    if (form.full_name.trim().length < 2) return setError('Enter the name of the person who will sign in.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email address.');
    if (isNew && form.password.length < 8) return setError('The starting password needs at least 8 characters.');
    if (!isNew && form.password && form.password.length < 8) return setError('The new password needs at least 8 characters.');

    const body = { club_name, full_name: form.full_name.trim(), email };
    if (form.password) body.password = form.password;
    setSaving(true);
    try {
      const saved = isNew ? await api.createClubAccount(body) : await api.updateClubAccount(account.id, body);
      setAccount(saved);
      setForm({ club_name: saved.club_name, full_name: saved.full_name, email: saved.email, password: '' });
      if (isNew || body.password) {
        setShare({ email: saved.email, password: body.password, created: isNew });
      } else {
        setNotice('Changes saved.');
        setShare((s) => s && { ...s, email: saved.email });  // keep the sign-in card accurate
      }
      api.clubs().then(setClubs).catch(() => {});
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirmAction('Delete club account',
      `Delete the sign-in for ${account.full_name} (${account.club_name})? Their events stay up; they just can't sign in anymore.`);
    if (!ok) return;
    setDeleting(true); setError('');
    try {
      await api.deleteClubAccount(account.id);
      if (router.canGoBack()) router.back(); else router.replace('/admin/clubs');
    } catch (e) {
      setError(e.message); setDeleting(false);
    }
  };

  if (!form) {
    return (
      <Screen scroll={!!error}>
        {error ? <><PageHeading title="Club account" backLabel="Club accounts" /><ErrorText>{error}</ErrorText></> : <Loading />}
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeading
        title={isNew ? 'New club account' : 'Club account'}
        subtitle={isNew ? 'Create a sign-in for a club. It can post and edit only its own events.'
          : `Manages ${account.event_count} event${account.event_count === 1 ? '' : 's'} for ${account.club_name}.`}
        backLabel="Club accounts"
      />

      {share ? (
        <Card style={st.share}>
          <Text style={st.shareTitle}>{share.created ? 'Club account created' : 'Password reset'}</Text>
          <Text style={[type.small, { marginBottom: 10 }]}>
            Share these sign-in details with the club. The password won’t be shown again; they can change it after
            signing in.
          </Text>
          <Text style={st.shareLine} selectable>Email: {share.email}</Text>
          <Text style={st.shareLine} selectable>Password: {share.password}</Text>
        </Card>
      ) : null}

      <SectionLabel>CLUB</SectionLabel>
      <Field label="Club name" value={form.club_name} onChangeText={set('club_name')} autoCapitalize="words"
        placeholder="SHPE at KSU" maxLength={200}
        hint={match?.event_count
          ? `Matches ${match.event_count} existing event${match.event_count === 1 ? '' : 's'}. This account can edit them.`
          : 'This account can edit events whose host is this exact club name.'} />
      {suggestions.length ? (
        <>
          <Text style={[type.small, { marginBottom: 8, marginTop: -4 }]}>Clubs with events:</Text>
          <View style={st.wrap}>
            {suggestions.map((c) => (
              <Chip key={c.name} label={`${c.name} · ${c.event_count}`} onPress={() => set('club_name')(c.name)} />
            ))}
          </View>
        </>
      ) : null}

      <SectionLabel>WHO SIGNS IN</SectionLabel>
      <Field label="Contact name" value={form.full_name} onChangeText={set('full_name')} autoCapitalize="words"
        placeholder="Club president or officer" maxLength={120} />
      <Field label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address"
        autoComplete="off" autoCorrect={false} placeholder="officer@kennesaw.edu" maxLength={255}
        hint="They sign in with this email." />
      <Field label={isNew ? 'Starting password' : 'New password'} secure value={form.password}
        onChangeText={set('password')} autoComplete="new-password" placeholder="At least 8 characters"
        hint={isNew ? undefined : 'Leave empty to keep the current password.'} />
      <Button title="Suggest a password" variant="ghost" icon="refresh-cw" style={{ marginTop: -8 }}
        onPress={() => set('password')(suggestPassword())} />

      <View style={{ marginTop: 20 }}>
        <ErrorText>{error}</ErrorText>
        {notice ? <Text style={st.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}
        <Button title={isNew ? 'Create club account' : 'Save changes'} onPress={save} loading={saving} />
        {!isNew ? (
          <Button title="Delete club account" variant="danger" style={{ marginTop: 12 }} onPress={remove}
            loading={deleting} />
        ) : null}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  share: { backgroundColor: colors.goldSoft, borderColor: colors.gold, paddingVertical: 16, marginTop: 8 },
  shareTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: 6 },
  shareLine: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 4 },
  notice: {
    color: colors.success, backgroundColor: '#E6F4EC', padding: 12, borderRadius: radius.sm,
    marginBottom: 14, fontWeight: '600',
  },
});
