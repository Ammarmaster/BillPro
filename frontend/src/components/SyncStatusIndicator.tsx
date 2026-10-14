import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { subscribeToSyncQueue, getPendingSyncCount, getSyncQueue, SyncAction } from "@/src/lib/offlineSync";
import { api } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";

export default function SyncStatusIndicator({ compact = false }: { compact?: boolean }) {
  // Silent background sync without displaying any intrusive syncing pills, badges or toasts
  return null;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  syncBtnBadge: {
    backgroundColor: "#D97706",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 2,
  },
  syncBtnText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});
