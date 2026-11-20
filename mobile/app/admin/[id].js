import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { colors, radius, type } from '../../src/theme';
import {
  Button, Card, Chip, ErrorText, Field, Flyer, Loading, PageHeading, Screen, SectionLabel, ToggleRow, confirmAction,
} from '../../src/ui';

const pad = (n) => String(n).padStart(2, '0');

function toParts(iso) {
  const d = new Date(iso);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

// Accepts "18:00", "6:00 pm", "6pm". Returns [hours, minutes] or null.
function parseTime(t) {
  const m = String(t).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === 'pm' ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return [h, min];
}

// Date + time in the device's timezone -> ISO string (UTC), or null if invalid.
function toIso(date, time) {
  const dm = String(date).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const tm = parseTime(time);
  if (!dm || !tm) return null;
  const d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), tm[0], tm[1]);
  if (d.getMonth() !== Number(dm[2]) - 1) return null; // e.g. 2026-02-31
  return d.toISOString();
}

function blankForm(host = '') {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(18, 0, 0, 0);
  const s = toParts(start);
  return {
    name: '', host_organization: host, description: '', location: '', campus: 'Kennesaw',
    start_date: s.date, start_time: '18:00', end_date: s.date, end_time: '20:00',
    is_free: true, rsvp_url: '', owl_life_url: '', categories: [],
  };
}

function formFrom(ev) {
  const s = toParts(ev.starts_at), e = toParts(ev.ends_at);
  return {
    name: ev.name, host_organization: ev.host_organization, description: ev.description || '',
    location: ev.location || '', campus: ev.campus === 'Marietta' ? 'Marietta' : 'Kennesaw',
    start_date: s.date, start_time: s.time, end_date: e.date, end_time: e.time,
    is_free: ev.is_free, rsvp_url: ev.rsvp_url || '', owl_life_url: ev.owl_life_url || '',
    categories: ev.categories.filter((c) => c.source !== 'ai' && c.source !== 'user').map((c) => c.key),
  };
}

const isPdfFile = (f) => f.mimeType === 'application/pdf' || /\.pdf$/i.test(f.name || '');
const MAX_FLYER_MB = 15;


export default function EditEvent() {
  const { id } = useLocalSearchParams();
  const creating = id === 'new';
  const router = useRouter();
  const { user } = useAuth();
  const isClub = user.role === 'club';
  const [event, setEvent] = useState(null);
  const [form, setForm] = useState(creating ? blankForm(isClub ? user.club_name : '') : null);
  const [cats, setCats] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [file, setFile] = useState(null);          // newly picked flyer, uploaded on save
  const [removeFlyer, setRemoveFlyer] = useState(false);
  // "New" until the event exists on the server. After Create we stay on this screen (no
  // navigation), so a failed flyer upload keeps its error message and picked file for a retry.
  const isNew = !event;

  useEffect(() => {
    api.categories().then(setCats).catch(() => {});
    if (!creating) {
      api.adminEvent(id)
        .then((ev) => { setEvent(ev); setForm(formFrom(ev)); })
        .catch((e) => setError(e.message));
    }
  }, [id, creating]);

  const set = (k) => (v) => { setNotice(''); setForm((f) => ({ ...f, [k]: v })); };
  const toggleCat = (key) => set('categories')(
    form.categories.includes(key) ? form.categories.filter((c) => c !== key) : [...form.categories, key]);

  const pickFlyer = async () => {
    setError(''); setNotice('');
    let res;
    try {
      res = await DocumentPicker.getDocumentAsync({
        type: ['image/png', 'image/jpeg', 'application/pdf'], copyToCacheDirectory: true, multiple: false,
      });
    } catch {
      return setError("Couldn't open that file. If it's in the cloud, download it to your device first.");
    }
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    if (asset.size && asset.size > MAX_FLYER_MB * 1024 * 1024) return setError(`Flyers must be ${MAX_FLYER_MB} MB or smaller.`);
    setFile(asset); setRemoveFlyer(false);
  };

  const save = async () => {
    setError(''); setNotice('');
    if (form.name.trim().length < 2) return setError('Add an event name.');
    if (!isClub && form.host_organization.trim().length < 2) return setError('Add the host organization.');
    const starts_at = toIso(form.start_date, form.start_time);
    const ends_at = toIso(form.end_date || form.start_date, form.end_time);
    if (!starts_at) return setError('Check the start date (YYYY-MM-DD) and time (e.g. 18:00 or 6:00 PM).');
    if (!ends_at) return setError('Check the end date (YYYY-MM-DD) and time (e.g. 20:00 or 8:00 PM).');
    if (new Date(ends_at) < new Date(starts_at)) return setError("The event can't end before it starts.");

    const body = {
      name: form.name.trim(),
      // Clubs always post as themselves; the server fills in their club name.
      ...(isClub ? {} : { host_organization: form.host_organization.trim() }),
      description: form.description.trim(), location: form.location.trim() || null, campus: form.campus,
      starts_at, ends_at, is_free: form.is_free,
      rsvp_url: form.rsvp_url.trim() || null, owl_life_url: form.owl_life_url.trim() || null,
      categories: form.categories,
    };
    setSaving(true);
    try {
      let saved = isNew ? await api.createEvent(body) : await api.updateEvent(event.id, body);
      if (file) {
        try {
          saved = await api.uploadFlyer(saved.id, file);
        } catch (e) {
          // The event itself saved; keep the picked file so Save retries just the upload.
          setEvent(saved); setForm(formFrom(saved));
          setError(`Event saved, but the flyer didn't upload: ${e.message}`);
          return;
        }
      } else if (removeFlyer && saved.flyer_url) {
        saved = await api.removeFlyer(saved.id);
      }
      setFile(null); setRemoveFlyer(false);
      setEvent(saved); setForm(formFrom(saved));
      setNotice(isNew ? 'Event created. Students see it right away.'
        : file ? 'Saved. The AI read the new flyer and updated the categories.'
          : 'Changes saved. Students see them right away.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirmAction('Delete event',
      `Delete "${event.name}"? Students who saved it will lose it. This can't be undone.`);
    if (!ok) return;
    setDeleting(true); setError('');
    try {
      await api.deleteEvent(event.id);
      // Go back rather than replace, so the dashboard isn't stacked twice.
      if (router.canGoBack()) router.back(); else router.replace('/admin');
    } catch (e) {
      setError(e.message); setDeleting(false);
    }
  };

  if (!form) {
    return (
      <Screen scroll={!!error}>
        {error ? <><PageHeading title="Edit event" backLabel="Events" /><ErrorText>{error}</ErrorText></> : <Loading />}
      </Screen>
    );
  }

  const aiCats = event?.categories.filter((c) => c.source === 'ai') || [];
  const hasFlyer = !!file || (!!event?.flyer_url && !removeFlyer);

  return (
    <Screen>
      <PageHeading
        title={isNew ? 'New event' : 'Edit event'}
        subtitle={isNew ? 'Fill in the details students will see on the event card.'
          : `${event.saves} student${event.saves === 1 ? '' : 's'} saved this event.`}
        backLabel="Events"
      />

      <SectionLabel>BASICS</SectionLabel>
      <Field label="Event name" value={form.name} onChangeText={set('name')} autoCapitalize="words"
        placeholder="Owl Hack Night" maxLength={200} />
      {isClub ? (
        <Field label="Host organization" value={user.club_name} editable={false}
          hint="Events you post are listed under your club." />
      ) : (
        <Field label="Host organization" value={form.host_organization} onChangeText={set('host_organization')}
          autoCapitalize="words" placeholder="ACM at KSU" maxLength={200}
          hint="Club accounts for this exact name can edit this event too." />
      )}
      <Field label="Description" value={form.description} onChangeText={set('description')} multiline
        autoCapitalize="sentences" placeholder="What should students know?" maxLength={5000} />

      <SectionLabel>WHEN</SectionLabel>
      <View style={st.pair}>
        <View style={st.half}><Field label="Start date" value={form.start_date} onChangeText={set('start_date')}
          placeholder="YYYY-MM-DD" /></View>
        <View style={st.half}><Field label="Start time" value={form.start_time} onChangeText={set('start_time')}
          placeholder="18:00" /></View>
      </View>
      <View style={st.pair}>
        <View style={st.half}><Field label="End date" value={form.end_date} onChangeText={set('end_date')}
          placeholder="YYYY-MM-DD" /></View>
        <View style={st.half}><Field label="End time" value={form.end_time} onChangeText={set('end_time')}
          placeholder="20:00" /></View>
      </View>
      <Text style={[type.small, { marginTop: -6 }]}>Times use this device's timezone.</Text>

      <SectionLabel>WHERE</SectionLabel>
      <Field label="Location" value={form.location} onChangeText={set('location')} autoCapitalize="words"
        placeholder="Student Center Commons" maxLength={200} />
      <Text style={st.label}>Campus</Text>
      <View style={st.wrap}>
        {['Kennesaw', 'Marietta'].map((c) => (
          <Chip key={c} label={c} active={form.campus === c} onPress={() => set('campus')(c)} />
        ))}
      </View>

      <SectionLabel>CATEGORIES</SectionLabel>
      <Text style={[type.small, { marginBottom: 10 }]}>
        Pick the ones that fit. The AI adds its own suggestions on top when you save.
      </Text>
      <View style={st.wrap}>
        {cats.map((c) => (
          <Chip key={c.key} label={c.label} active={form.categories.includes(c.key)} onPress={() => toggleCat(c.key)} />
        ))}
      </View>
      {aiCats.length ? (
        <Text style={[type.small, { marginTop: 4 }]}>
          AI suggested: {aiCats.map((c) => `${c.label} (${Math.round(c.confidence * 100)}%)`).join(', ')}
        </Text>
      ) : null}

      <SectionLabel>FLYER</SectionLabel>
      <Text style={[type.small, { marginBottom: 10 }]}>
        PNG, JPG or PDF, up to {MAX_FLYER_MB} MB. The AI reads the text on the flyer to pick categories that match
        students' interests.
      </Text>
      <Card style={{ paddingHorizontal: 0, overflow: 'hidden', marginBottom: 12 }}>
        {file ? (isPdfFile(file) ? (
          <View style={[st.flyer, st.pdf]}>
            <Text style={st.pdfTitle}>PDF</Text>
            <Text style={st.pdfName} numberOfLines={2}>{file.name}</Text>
            <Text style={st.pdfNote}>A preview of page 1 is made when you save.</Text>
          </View>
        ) : <Image source={{ uri: file.uri }} style={st.flyer} resizeMode="contain" accessibilityLabel="Selected flyer" />)
          : hasFlyer ? <Flyer event={event} style={st.flyer} resizeMode="contain" />
          : (
            <View style={[st.flyer, st.pdf]}>
              <Text style={st.pdfNote}>{removeFlyer ? 'The flyer will be removed when you save.' : 'No flyer yet.'}</Text>
            </View>
          )}
      </Card>
      {file ? <Text style={[type.small, { marginBottom: 10 }]}>New flyer selected: {file.name}. It uploads when you save.</Text> : null}
      <View style={st.pair}>
        <Button title={hasFlyer ? 'Replace flyer' : 'Choose flyer'} icon="upload" variant="outline" style={st.half}
          onPress={pickFlyer} />
        {file ? (
          <Button title="Undo" variant="ghost" style={st.half} onPress={() => setFile(null)} />
        ) : hasFlyer ? (
          <Button title="Remove flyer" variant="ghost" style={st.half} onPress={() => setRemoveFlyer(true)} />
        ) : removeFlyer ? (
          <Button title="Keep flyer" variant="ghost" style={st.half} onPress={() => setRemoveFlyer(false)} />
        ) : null}
      </View>

      <SectionLabel>LINKS & COST</SectionLabel>
      <Field label="RSVP link" value={form.rsvp_url} onChangeText={set('rsvp_url')} placeholder="https://…"
        keyboardType="url" />
      <Field label="Owl Life page" value={form.owl_life_url} onChangeText={set('owl_life_url')}
        placeholder="https://owllife.kennesaw.edu/…" keyboardType="url" />
      <Card>
        <ToggleRow title="Free event" value={form.is_free} onValueChange={set('is_free')} last />
      </Card>

      <View style={{ marginTop: 24 }}>
        <ErrorText>{error}</ErrorText>
        {notice ? <Text style={st.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}
        <Button title={isNew ? 'Create event' : 'Save changes'} onPress={save} loading={saving} />
        {!isNew ? (
          <>
            <Button title="Preview as student" variant="outline" style={{ marginTop: 12 }}
              onPress={() => router.push(`/event/${event.id}`)} />
            <Button title="Delete event" variant="danger" style={{ marginTop: 12 }} onPress={remove} loading={deleting} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  pair: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  flyer: { width: '100%', height: 320 },
  pdf: { backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', padding: 28 },
  pdfTitle: { color: colors.gold, fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  pdfName: { color: '#FFF', fontSize: 16, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  pdfNote: { color: '#CFCFCF', fontSize: 13, marginTop: 10, textAlign: 'center' },
  notice: {
    color: colors.success, backgroundColor: '#E6F4EC', padding: 12, borderRadius: radius.sm,
    marginBottom: 14, fontWeight: '600',
  },
});
