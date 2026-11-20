import { Feather } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fmt, fmtRange, radius } from './theme';
import { CategoryTag, Flyer } from './ui';

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 0.6;
// The pan gesture drives `pos` from JS, so every animation on it must stay JS-driven too.
const useNative = false;

/**
 * One flyer at a time (FR-03). Drag right to save, left to skip; the parent gets
 * onSwipe(event, 'right' | 'left') after the card leaves the screen. The ref exposes
 * swipe(direction) so the "I'm interested" / "Not for me" buttons animate the same way.
 */
const SwipeDeck = forwardRef(function SwipeDeck({ events, onSwipe, onOpen, onOpenFlyer }, ref) {
  const pos = useRef(new Animated.ValueXY()).current;
  const busy = useRef(false);
  const top = events[0];
  const next = events[1];
  const width = Dimensions.get('window').width;

  // Keep the latest props reachable from the PanResponder created once below.
  const latest = useRef({});
  latest.current = { top, onSwipe };

  const flyOut = (direction, vx = 0) => {
    const ev = latest.current.top;
    if (!ev || busy.current) return;
    busy.current = true;
    const x = (direction === 'right' ? 1 : -1) * (width + 200);
    Animated.timing(pos, {
      toValue: { x, y: 0 },
      duration: Math.max(140, 260 - Math.abs(vx) * 80),
      useNativeDriver: useNative,
    }).start(() => {
      latest.current.onSwipe(ev, direction);
      pos.setValue({ x: 0, y: 0 });
      busy.current = false;
    });
  };

  useImperativeHandle(ref, () => ({ swipe: (d) => flyOut(d) }));

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      if (g.dx > SWIPE_DISTANCE || g.vx > SWIPE_VELOCITY) return flyOut('right', g.vx);
      if (g.dx < -SWIPE_DISTANCE || g.vx < -SWIPE_VELOCITY) return flyOut('left', g.vx);
      Animated.spring(pos, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: useNative }).start();
    },
    onPanResponderTerminate: () =>
      Animated.spring(pos, { toValue: { x: 0, y: 0 }, useNativeDriver: useNative }).start(),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!top) return null;

  const rotate = pos.x.interpolate({ inputRange: [-width, 0, width], outputRange: ['-14deg', '0deg', '14deg'] });
  const saveOpacity = pos.x.interpolate({ inputRange: [20, SWIPE_DISTANCE], outputRange: [0, 1], extrapolate: 'clamp' });
  const passOpacity = pos.x.interpolate({ inputRange: [-SWIPE_DISTANCE, -20], outputRange: [1, 0], extrapolate: 'clamp' });
  const nextScale = pos.x.interpolate({
    inputRange: [-width, 0, width], outputRange: [1, 0.94, 1], extrapolate: 'clamp',
  });

  return (
    <View style={st.deck}>
      {next ? (
        <Animated.View
          key={`next-${next.id}`}
          style={[st.card, st.nextCard, { transform: [{ scale: nextScale }, { translateY: 14 }] }]}
          accessibilityLabel="Next event in stack"
          pointerEvents="none"
        >
          <EventCard event={next} />
        </Animated.View>
      ) : null}
      <Animated.View
        key={`top-${top.id}`}
        {...responder.panHandlers}
        style={[st.card, { transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }] }]}
      >
        <EventCard event={top} onOpen={() => onOpen(top)} onOpenFlyer={() => onOpenFlyer(top)} />
        <Animated.View style={[st.stamp, st.stampSave, { opacity: saveOpacity }]} pointerEvents="none">
          <Text style={[st.stampText, { color: colors.black }]}>SAVE</Text>
        </Animated.View>
        <Animated.View style={[st.stamp, st.stampPass, { opacity: passOpacity }]} pointerEvents="none">
          <Text style={[st.stampText, { color: '#FFF' }]}>PASS</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
});

export default SwipeDeck;

function EventCard({ event, onOpen, onOpenFlyer }) {
  const category = event.categories?.[0]?.label;
  return (
    <View style={st.inner}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onOpenFlyer} accessibilityLabel="View flyer close up">
        <Flyer event={event} style={StyleSheet.absoluteFill} />
      </Pressable>
      <View style={st.shade} pointerEvents="box-none">
        <View style={st.tagRow}>
          {category ? <CategoryTag label={category} light /> : null}
          {event.reason ? (
            <View style={st.reason}><Text style={st.reasonText}>{event.reason}</Text></View>
          ) : null}
        </View>
        <Text style={st.title} numberOfLines={2}>{event.name}</Text>
        <Text style={st.when}>
          {event.is_ongoing ? 'HAPPENING NOW' : fmt.shortDay(event.starts_at)}  ·  {fmtRange(event.starts_at, event.ends_at)}
        </Text>
        <Text style={st.where} numberOfLines={1}>{event.host_organization} · {event.campus} campus</Text>
        {onOpen ? (
          <Pressable onPress={onOpen} style={st.info} accessibilityRole="button" accessibilityLabel="Open event information" hitSlop={10}>
            <Feather name="info" size={20} color={colors.black} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  deck: { flex: 1, minHeight: 380 },
  card: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.lg,
    backgroundColor: colors.black,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  nextCard: { opacity: 0.9 },
  inner: { flex: 1, borderRadius: radius.lg, overflow: 'hidden' },
  shade: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, paddingTop: 22,
    backgroundColor: colors.black,
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10, paddingRight: 48 },
  reason: { backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  reasonText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  title: { color: '#FFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.3, paddingRight: 44 },
  when: { color: colors.gold, fontSize: 13, fontWeight: '800', letterSpacing: 0.8, marginTop: 6 },
  where: { color: '#D6D6D6', fontSize: 13, marginTop: 4 },
  info: {
    position: 'absolute', right: 16, top: 18, width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
  },
  stamp: {
    position: 'absolute', top: 28, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.sm,
    borderWidth: 3,
  },
  stampSave: { left: 24, backgroundColor: colors.gold, borderColor: colors.black, transform: [{ rotate: '-12deg' }] },
  stampPass: { right: 24, backgroundColor: colors.danger, borderColor: '#FFF', transform: [{ rotate: '12deg' }] },
  stampText: { fontSize: 26, fontWeight: '900', letterSpacing: 2 },
});
