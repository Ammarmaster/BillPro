import React, { PropsWithChildren } from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { useResponsive } from "@/src/hooks/useResponsive";

interface ResponsiveContainerProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  maxWidth?: number;
}

export default function ResponsiveContainer({
  children,
  style,
  contentStyle,
  maxWidth = 1400,
}: ResponsiveContainerProps) {
  const { isDesktop } = useResponsive();

  if (!isDesktop) {
    return <View style={[styles.mobileWrapper, style]}>{children}</View>;
  }

  return (
    <View style={[styles.desktopOuter, style]}>
      <View style={[styles.desktopInner, { maxWidth }, contentStyle]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mobileWrapper: {
    flex: 1,
    width: "100%",
  },
  desktopOuter: {
    flex: 1,
    width: "100%",
    alignItems: "center",
  },
  desktopInner: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
});
