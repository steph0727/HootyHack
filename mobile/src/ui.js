import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, type } from './theme';

export function Screen({ children, scroll = true, style, contentStyle }) {
  return (
    <SafeAreaView style={[s.screen, style]} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={[s.content, contentStyle]} keyboardShouldPersistTaps="handled">
          <View style={s.maxWidth}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[s.content, s.fill, contentStyle]}><View style={[s.maxWidth, s.fill]}>{children}</View></View>
      )}
    </SafeAreaView>
  );
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style }) {
  const v = variants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, v.btn, (disabled || loading) && { opacity: 0.5 }, pressed && { opacity: 0.85 }, style]}
    >
      {loading ? <ActivityIndicator color={v.text.color} /> : (
        <>
          {icon ? <Feather name={icon} size={18} color={v.text.color} style={{ marginRight: 8 }} /> : null}
          <Text style={[s.btnText, v.text]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const variants = {
  primary: { btn: { backgroundColor: colors.black }, text: { color: colors.gold } },
  gold: { btn: { backgroundColor: colors.gold }, text: { color: colors.black } },
  outline: { btn: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.ink }, text: { color: colors.ink } },
  ghost: { btn: { backgroundColor: 'transparent' }, text: { color: colors.ink } },
  danger: { btn: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.danger }, text: { color: colors.danger } },
};

export function Field({ label, secure, hint, multiline, ...props }) {
  const [hidden, setHidden] = useState(!!secure);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.inputWrap, multiline && s.inputWrapMulti]}>
        <TextInput
          style={[s.input, multiline && s.inputMulti]}
          multiline={multiline}
          placeholderTextColor="#A39E92"
          secureTextEntry={hidden}
          autoCapitalize="none"
          {...props}
        />
        {secure ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityRole="button">
            <Text style={s.show}>{hidden ? 'Show' : 'Hide'}</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={[type.small, { marginTop: 6 }]}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return <Text style={s.error} accessibilityLiveRegion="polite">{children}</Text>;
}

export function Chip({ label, active, onPress, icon, dark }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={[s.chip, active && s.chipActive, dark && !active && s.chipDark]}
    >
      {icon ? <Feather name={icon} size={14} color={active ? colors.gold : colors.ink} style={{ marginRight: 6 }} /> : null}
      <Text style={[s.chipText, active && { color: colors.gold }]}>{label}</Text>
    </Pressable>
  );
}

export function CategoryTag({ label, light }) {
  return (
    <View style={[s.tag, light && { backgroundColor: colors.gold }]}>
      <Text style={[s.tagText, light && { color: colors.black }]}>{String(label).toUpperCase()}</Text>
    </View>
  );
}

export function ToggleRow({ title, subtitle, value, onValueChange, last }) {
  return (
    <View style={[s.row, !last && s.rowDivider]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {subtitle ? <Text style={s.rowSub}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={!!value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D9D3C4', true: colors.black }}
        thumbColor={value ? colors.gold : '#FFFFFF'}
        activeThumbColor={colors.gold}
        accessibilityLabel={title}
      />
    </View>
  );
}

export function LinkRow({ title, subtitle, onPress, last, right }) {
  return (
    <Pressable onPress={onPress} style={[s.row, !last && s.rowDivider]} accessibilityRole="button">
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {subtitle ? <Text style={s.rowSub}>{subtitle}</Text> : null}
      </View>
      {right}
      <Feather name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );
}

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionLabel({ children }) {
  return <Text style={[type.eyebrow, { marginTop: 24, marginBottom: 10 }]}>{children}</Text>;
}

/** Settings sub-page heading: "< Settings", title, subtitle (matches Figma 08–13). */
export function PageHeading({ title, subtitle, backLabel = 'Settings' }) {
  const router = useRouter();
  return (
    <View style={{ marginBottom: 8 }}>
      <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button" hitSlop={8}>
        <Feather name="chevron-left" size={20} color={colors.ink} />
        <Text style={s.backText}>{backLabel}</Text>
      </Pressable>
      <Text style={type.h1}>{title}</Text>
      {subtitle ? <Text style={[type.body, { marginTop: 6 }]}>{subtitle}</Text> : null}
    </View>
  );
}

/** Event flyer with a branded placeholder when the image is missing or fails to load. */
export function Flyer({ event, style, resizeMode = 'cover' }) {
  const [failed, setFailed] = useState(false);
  const uri = event?.flyer_type === 'pdf' ? event?.flyer_preview_url : event?.flyer_url;
  if (!uri || failed) {
    return (
      <View style={[style, s.placeholder]}>
        <Text style={s.placeholderHoot}>HOOTY SWIPE</Text>
        <Text style={s.placeholderTitle} numberOfLines={4}>{event?.name}</Text>
        <Text style={s.placeholderHost}>{event?.host_organization}</Text>
        <Text style={s.placeholderNote}>
          {event?.flyer_type === 'pdf' ? 'Flyer available as PDF' : 'No flyer provided'}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[style, { backgroundColor: colors.line }]}
      resizeMode={resizeMode}
      onError={() => setFailed(true)}
      accessibilityLabel={`Flyer for ${event?.name}`}
    />
  );
}

/** Destructive confirm dialog that works on iOS, Android and web. Resolves true if confirmed. */
export function confirmAction(title, message, confirmLabel = 'Delete') {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

export function Loading() {
  return <View style={[s.fill, s.center]}><ActivityIndicator color={colors.ink} size="large" /></View>;
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  maxWidth: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  btn: {
    height: 54, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 22,
  },
  btnText: { fontSize: 15, fontWeight: '800' },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1.5,
    borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 16, height: 54,
  },
  inputWrapMulti: { height: undefined, minHeight: 120, alignItems: 'flex-start', paddingVertical: 12 },
  inputMulti: { height: undefined, minHeight: 96, textAlignVertical: 'top' },
  input: { flex: 1, fontSize: 16, color: colors.ink, height: '100%', outlineStyle: 'none' },
  show: { fontWeight: '700', color: colors.ink, textDecorationLine: 'underline' },
  error: {
    color: colors.danger, backgroundColor: '#FDECEC', padding: 12, borderRadius: radius.sm,
    marginBottom: 14, fontWeight: '600',
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 36, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, marginRight: 8, marginBottom: 8,
  },
  chipActive: { backgroundColor: colors.black, borderColor: colors.black },
  chipDark: {},
  chipText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  tag: {
    alignSelf: 'flex-start', backgroundColor: colors.black, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.pill,
  },
  tagText: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, minHeight: 56 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 3 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 18, borderWidth: 1,
    borderColor: colors.line,
  },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, marginLeft: -4, alignSelf: 'flex-start' },
  backText: { fontSize: 16, fontWeight: '600', color: colors.ink },
  placeholder: { backgroundColor: colors.black, padding: 28, justifyContent: 'flex-end' },
  placeholderHoot: { color: colors.gold, fontWeight: '800', letterSpacing: 2, marginBottom: 16 },
  placeholderTitle: { color: '#FFF', fontSize: 34, fontWeight: '800', lineHeight: 38 },
  placeholderHost: { color: '#CFCFCF', fontSize: 16, marginTop: 10, fontWeight: '600' },
  placeholderNote: { color: colors.gold, fontSize: 13, marginTop: 18, marginBottom: 120 },
});
