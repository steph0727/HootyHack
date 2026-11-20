import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../src/auth';
import { colors, radius, type } from '../../src/theme';
import { Button, ErrorText, Field, Screen } from '../../src/ui';

export default function CreateAccount() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError('');
    if (form.full_name.trim().split(/\s+/).length < 2) return setError('Enter your first and last name.');
    if (!/@(students\.)?kennesaw\.edu$/i.test(form.email.trim())) return setError('Use your KSU email (you@students.kennesaw.edu).');
    if (form.password.length < 8) return setError('Your password needs at least 8 characters.');
    if (!agreed) return setError('Please agree to the Terms of Service and Privacy Policy.');
    setLoading(true);
    try {
      await register({ ...form, agreed_to_terms: agreed });
      router.replace('/settings/preferences?onboarding=1');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
        <Text style={{ fontSize: 24, color: colors.ink }}>←</Text>
      </Pressable>
      <Text style={[type.eyebrow, { marginTop: 18 }]}>HOOTY SWIPE</Text>
      <Text style={[type.h1, { marginTop: 6 }]}>Find where you belong.</Text>
      <Text style={[type.body, { marginTop: 6, marginBottom: 22 }]}>One campus. A whole lot of possibilities.</Text>

      <View style={st.role}>
        <Text style={st.roleText}>Student account</Text>
        <Text style={st.roleCheck}>✓</Text>
      </View>

      <ErrorText>{error}</ErrorText>
      <Field label="Full name" placeholder="Your first and last name" autoCapitalize="words"
        autoComplete="name" value={form.full_name} onChangeText={set('full_name')} />
      <Field label="KSU email" placeholder="you@students.kennesaw.edu" keyboardType="email-address"
        autoComplete="email" value={form.email} onChangeText={set('email')} />
      <Field label="Create password" placeholder="At least 8 characters" secure autoComplete="new-password"
        textContentType="newPassword" value={form.password} onChangeText={set('password')} />

      <Pressable style={st.terms} onPress={() => setAgreed((a) => !a)} accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}>
        <View style={[st.box, agreed && st.boxOn]}>{agreed ? <Text style={st.tick}>✓</Text> : null}</View>
        <Text style={[type.body, { flex: 1 }]}>I agree to the Terms of Service and Privacy Policy.</Text>
      </Pressable>

      <Button title="Create account  →" onPress={submit} loading={loading} />
      <View style={st.footer}>
        <Text style={type.body}>Already have an account? </Text>
        <Link href="/sign-in" style={st.link}>Sign in</Link>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  role: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.black,
    borderRadius: radius.md, paddingHorizontal: 18, height: 52, marginBottom: 20,
  },
  roleText: { color: colors.gold, fontWeight: '800', fontSize: 15 },
  roleCheck: { color: colors.gold, fontWeight: '900', fontSize: 16 },
  terms: { flexDirection: 'row', alignItems: 'center', marginBottom: 22, marginTop: 4 },
  box: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.ink, marginRight: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.black, borderColor: colors.black },
  tick: { color: colors.gold, fontWeight: '900' },
  link: { fontWeight: '800', color: colors.ink, textDecorationLine: 'underline', fontSize: 15 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 22 },
});
