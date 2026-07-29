import React from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type PermissionDisclosureModalProps = {
  visible: boolean;
  title: string;
  description: string;
  icon: string;
  onAllow: () => void;
  onCancel: () => void;
};

export default function PermissionDisclosureModal({
  visible,
  title,
  description,
  icon,
  onAllow,
  onCancel,
}: PermissionDisclosureModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.iconBox}>
            <Ionicons name={icon as any} size={32} color="#FF5E2B" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.actionRow}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Not Now</Text>
            </Pressable>
            <Pressable style={styles.allowBtn} onPress={onAllow}>
              <Text style={styles.allowBtnText}>Continue</Text>
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
    backgroundColor: "#16161A",
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2E2E38",
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 94, 43, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  description: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
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
    fontWeight: "600",
  },
  allowBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FF5E2B",
  },
  allowBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
