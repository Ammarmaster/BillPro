import React from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type FeatureLockModalProps = {
  visible: boolean;
  title: string;
  description: string;
  requiredPlan: "Growth" | "Pro";
  onUpgrade: () => void;
  onCancel: () => void;
};

export default function FeatureLockModal({
  visible,
  title,
  description,
  requiredPlan,
  onUpgrade,
  onCancel,
}: FeatureLockModalProps) {
  const brandColor = requiredPlan === "Pro" ? "#635BFF" : "#FF5E2B";
  const bgOpacity = requiredPlan === "Pro" ? "rgba(99, 91, 255, 0.1)" : "rgba(255, 94, 43, 0.1)";

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={[styles.iconBox, { backgroundColor: bgOpacity }]}>
            <Ionicons name="lock-closed" size={32} color={brandColor} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          
          <View style={[styles.planBadge, { borderColor: brandColor + "40", backgroundColor: bgOpacity }]}>
            <Text style={[styles.planBadgeText, { color: brandColor }]}>REQUIRES {requiredPlan.toUpperCase()} PLAN</Text>
          </View>

          <View style={styles.actionRow}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Maybe Later</Text>
            </Pressable>
            <Pressable style={[styles.allowBtn, { backgroundColor: brandColor }]} onPress={onUpgrade}>
              <Text style={styles.allowBtnText}>Upgrade Now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    backgroundColor: "#11121A",
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#2E2E38",
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 8,
  },
  description: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  planBadge: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 24,
  },
  planBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#2E2E38",
  },
  cancelBtnText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "700",
  },
  allowBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  allowBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
