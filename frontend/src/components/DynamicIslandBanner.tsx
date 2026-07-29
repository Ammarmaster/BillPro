import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, PanResponder, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNotifications } from "@/src/context/NotificationContext";
import { spacing } from "@/src/theme";

const { width } = Dimensions.get("window");
const BANNER_WIDTH = Math.min(width - 32, 400);

const CATEGORY_ICONS: Record<string, string> = {
  sales: "bar-chart",
  kitchen: "restaurant",
  waiter: "people",
  cashier: "calculator",
  system: "settings",
  payment: "card"
};

const CATEGORY_COLORS: Record<string, string> = {
  sales: "#10B981",
  kitchen: "#635BFF",
  waiter: "#3B82F6",
  cashier: "#F59E0B",
  system: "#64748B",
  payment: "#EF4444"
};

export default function DynamicIslandBanner() {
  const { banner, dismissBanner } = useNotifications();
  const slideAnim = useRef(new Animated.Value(-150)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<any>(null);

  // Swipe-to-dismiss gesture responder
  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -30) {
          // Swiped up: Dismiss
          hideBanner();
        } else {
          // Snap back
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      }
    })
  ).current;

  useEffect(() => {
    if (banner) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      showBanner();
      // Auto-dismiss after 6 seconds
      timeoutRef.current = setTimeout(() => {
        hideBanner();
      }, 6000);
    }
  }, [banner]);

  const showBanner = () => {
    pan.setValue({ x: 0, y: 0 });
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 20, // Margin from top
        friction: 5,
        tension: 40,
        useNativeDriver: false
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false
      })
    ]).start();
  };

  const hideBanner = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -150,
        duration: 250,
        useNativeDriver: false
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false
      })
    ]).start(() => {
      dismissBanner();
    });
  };

  if (!banner) return null;

  const color = CATEGORY_COLORS[banner.category] || "#FF5E2B";
  const iconName = CATEGORY_ICONS[banner.category] || "notifications";

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateY: slideAnim },
            { translateY: pan.y }
          ],
          opacity: opacityAnim
        }
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.islandBody}>
        {/* Category Badge Icon */}
        <View style={[styles.iconFrame, { backgroundColor: color }]}>
          <Ionicons name={iconName as any} size={18} color="#FFFFFF" />
        </View>

        {/* Text Area */}
        <View style={styles.textFrame}>
          <Text style={styles.title} numberOfLines={1}>
            {banner.title}
          </Text>
          <Text style={styles.desc} numberOfLines={2}>
            {banner.message}
          </Text>
        </View>

        {/* Dismiss Close Icon */}
        <Pressable style={styles.closeBtn} onPress={hideBanner}>
          <Ionicons name="close" size={16} color="#64748B" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    alignSelf: "center",
    width: BANNER_WIDTH,
    zIndex: 99999,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  islandBody: {
    backgroundColor: "#16161A",
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: "#2E2E38",
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  iconFrame: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  textFrame: {
    flex: 1,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  desc: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
    lineHeight: 14,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: "#2E2E38",
  },
});
