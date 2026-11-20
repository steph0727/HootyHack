import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../src/auth';
import { colors, type } from '../../src/theme';
import { Button, ErrorText, Field, Screen } from '../../src/ui';

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    if (!email.trim() || !password) return setError('Enter your KSU email and password.');
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const forgot = () => {
    const msg = 'Password resets aren’t available in this version yet. Ask a team admin to reset your account.';
    Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Forgot password', msg);
  };

  return (
    <Screen contentStyle={{ paddingTop: 40 }}>
      <View style={st.hero} accessibilityLabel="Hooty Hack welcome">
        <Text style={st.owl}>🦉</Text>
        <Text style={[type.eyebrow, { color: colors.gold }]}>HOOTY HACK</Text>
      </View>
      <Text style={type.h1}>Welcome back, Owl.</Text>
      <Text style={[type.body, { marginTop: 6, marginBottom: 28 }]}>Sign in to find your next campus thing.</Text>

      <ErrorText>{error}</ErrorText>
      <Field
        label="KSU email" placeholder="you@students.kennesaw.edu" keyboardType="email-address"
        autoComplete="email" textContentType="username" value={email} onChangeText={setEmail}
      />
      <Field
        label="Password" placeholder="••••••••••••" secure autoComplete="current-password"
        textContentType="password" value={password} onChangeText={setPassword} onSubmitEditing={submit}
      />
      <Pressable onPress={forgot} style={{ alignSelf: 'flex-end', marginBottom: 24 }} accessibilityRole="button">
        <Text style={st.link}>Forgot password?</Text>
      </Pressable>
      <Button title="Sign in  →" onPress={submit} loading={loading} />

      <View style={st.footer}>
        <Text style={type.body}>New around here? </Text>
        <Link href="/create-account" style={st.link}>Create account</Link>
      </View>
      <Text style={[type.small, { textAlign: 'center', marginTop: 28 }]}>Discover events listed on Owl Life.</Text>
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: {
    backgroundColor: colors.black, borderRadius: 28, height: 150, alignItems: 'center', justifyContent: 'center',
    marginBottom: 28,
  },
  owl: { fontSize: 54, marginBottom: 6 },
  link: { fontWeight: '800', color: colors.ink, textDecorationLine: 'underline', fontSize: 15 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
});
