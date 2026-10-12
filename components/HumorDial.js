import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useLanguage } from "../context/LanguageContext";
import { HUMOR_LEVELS, normalizeHumorLevel } from "../services/assistantHumor";

const THUMB_SIZE = 22;
const PAD = THUMB_SIZE / 2;
const LEVEL_EMOJI = { low: "🙂", medium: "😄", high: "🤣" };

// Three-stop humor slider shown on top of the chat. The thumb is dragged by
// hand and snaps to low / medium / high; tapping the track or a label works
// too. Locked (free users) it shows the same dial dimmed and opens Prime.
export default function HumorDial({ value, onChange, locked = false, onLockedPress, theme }) {
  const { t } = useLanguage();
  const level = locked ? "low" : normalizeHumorLevel(value);
  const [trackWidth, setTrackWidth] = useState(0);
  const thumbX = useRef(new Animated.Value(0)).current;
  const draggingRef = useRef(false);
  const grantXRef = useRef(0);
  const previewIndexRef = useRef(HUMOR_LEVELS.indexOf(level));

  // Kept in refs so the PanResponder (created once) always sees fresh values.
  const stateRef = useRef({});
  stateRef.current = { trackWidth, locked, level, onChange, onLockedPress };

  const stopX = (index, width = trackWidth) => (width * index) / (HUMOR_LEVELS.length - 1);
  const nearestIndex = (x, width) =>
    Math.max(0, Math.min(HUMOR_LEVELS.length - 1, Math.round((x / width) * (HUMOR_LEVELS.length - 1))));

  useEffect(() => {
    if (!trackWidth || draggingRef.current) return;
    const index = HUMOR_LEVELS.indexOf(level);
    previewIndexRef.current = index;
    Animated.spring(thumbX, {
      toValue: (trackWidth * index) / (HUMOR_LEVELS.length - 1),
      useNativeDriver: false,
      friction: 7,
      tension: 80,
    }).start();
  }, [level, trackWidth, thumbX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          const { trackWidth: width, locked: isLocked } = stateRef.current;
          if (isLocked || !width) return;
          draggingRef.current = true;
          grantXRef.current = Math.max(0, Math.min(width, event.nativeEvent.locationX - PAD));
          thumbX.setValue(grantXRef.current);
          const index = nearestIndex(grantXRef.current, width);
          if (index !== previewIndexRef.current) {
            previewIndexRef.current = index;
            Haptics.selectionAsync().catch(() => {});
          }
        },
        onPanResponderMove: (_event, gesture) => {
          const { trackWidth: width, locked: isLocked } = stateRef.current;
          if (isLocked || !width) return;
          const x = Math.max(0, Math.min(width, grantXRef.current + gesture.dx));
          thumbX.setValue(x);
          const index = nearestIndex(x, width);
          if (index !== previewIndexRef.current) {
            previewIndexRef.current = index;
            Haptics.selectionAsync().catch(() => {});
          }
        },
        onPanResponderRelease: (_event, gesture) => {
          const { trackWidth: width, locked: isLocked, level: current, onChange: change, onLockedPress: lockedPress } =
            stateRef.current;
          if (isLocked) {
            lockedPress?.();
            return;
          }
          if (!width) return;
          draggingRef.current = false;
          const x = Math.max(0, Math.min(width, grantXRef.current + gesture.dx));
          const index = nearestIndex(x, width);
          Animated.spring(thumbX, {
            toValue: (width * index) / (HUMOR_LEVELS.length - 1),
            useNativeDriver: false,
            friction: 7,
            tension: 80,
          }).start();
          if (HUMOR_LEVELS[index] !== current) change?.(HUMOR_LEVELS[index]);
        },
        onPanResponderTerminate: () => {
          draggingRef.current = false;
        },
      }),
    [thumbX]
  );

  const selectLevel = (next) => {
    if (locked) {
      onLockedPress?.();
      return;
    }
    if (next === level) return;
    Haptics.selectionAsync().catch(() => {});
    onChange?.(next);
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
        locked && styles.cardLocked,
      ]}
    >
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.text }]}>
          {LEVEL_EMOJI[level]} {t("assistant.humor.title")}
        </Text>
        {locked ? (
          <TouchableOpacity style={styles.lockBadge} onPress={onLockedPress} activeOpacity={0.8}>
            <Ionicons name="lock-closed" size={11} color={theme.primary} />
            <Text style={[styles.lockText, { color: theme.primary }]}>{t("assistant.humor.locked")}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.hint, { color: theme.subText }]} numberOfLines={1}>
            {t(`assistant.humor.hints.${level}`)}
          </Text>
        )}
      </View>

      <View
        style={styles.trackArea}
        onLayout={(event) => setTrackWidth(Math.max(0, event.nativeEvent.layout.width - THUMB_SIZE))}
        {...panResponder.panHandlers}
      >
        <View pointerEvents="none" style={[styles.track, { backgroundColor: `${theme.primary}26` }]} />
        <Animated.View
          pointerEvents="none"
          style={[styles.trackFill, { backgroundColor: theme.primary, width: thumbX }]}
        />
        {HUMOR_LEVELS.map((stop, index) => (
          <View
            key={stop}
            pointerEvents="none"
            style={[
              styles.stopDot,
              { left: PAD + stopX(index) - 4, backgroundColor: index <= HUMOR_LEVELS.indexOf(level) ? theme.primary : `${theme.primary}55` },
            ]}
          />
        ))}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            { borderColor: theme.primary, shadowColor: theme.primary, transform: [{ translateX: thumbX }] },
          ]}
        />
      </View>

      <View style={styles.labelsRow}>
        {HUMOR_LEVELS.map((stop) => (
          <TouchableOpacity key={stop} onPress={() => selectLevel(stop)} hitSlop={8} activeOpacity={0.7}>
            <Text
              style={[
                styles.label,
                { color: stop === level ? theme.primary : theme.subText },
                stop === level && styles.labelActive,
              ]}
            >
              {t(`assistant.humor.levels.${stop}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  cardLocked: { opacity: 0.72 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  title: { fontSize: 13, fontWeight: "800" },
  hint: { flexShrink: 1, marginLeft: 10, fontSize: 12, fontWeight: "600" },
  lockBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  lockText: { fontSize: 12, fontWeight: "800" },
  trackArea: { height: 30, justifyContent: "center" },
  track: { position: "absolute", left: PAD, right: PAD, height: 4, borderRadius: 2 },
  trackFill: { position: "absolute", left: PAD, height: 4, borderRadius: 2 },
  stopDot: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
  thumb: {
    position: "absolute",
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 3,
    backgroundColor: "#FFFFFF",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  labelsRow: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontSize: 12, fontWeight: "600" },
  labelActive: { fontWeight: "900" },
});
