import { useState } from "react";
import {
  View, StyleSheet, Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import {
  Mono,
  ReceiptButton,
  ReceiptField,
  ReceiptFormShell,
  ReceiptNotice,
  ReceiptRule,
  receipt,
} from "@/src/components/ReceiptKit";

export default function StaffLogin() {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { staffLogin } = useAuth();
  const router = useRouter();

  const submit = async () => {
    setErr(null);
    if (!phone.trim() || pin.trim().length < 4) {
      setErr("Enter business phone and 4-6 digit PIN.");
      return;
    }
    setBusy(true);
    try {
      const u = await staffLogin(phone.trim(), pin.trim());
      if (u?.role === "kitchen") {
        router.replace("/(app)/kitchen");
      } else {
        router.replace("/(app)/waiter");
      }
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ReceiptFormShell
      subtitle="Staff portal"
      title="Employee sign in"
      description="Enter your registered business phone and PIN"
    >
      <ReceiptField
        label="Business phone"
        icon="call-outline"
        value={phone}
        onChangeText={setPhone}
        placeholder="+91 98765 43210"
        keyboardType="phone-pad"
        autoCapitalize="none"
        testID="staff-phone-input"
      />

      <ReceiptField
        label="Employee PIN (4-6 digits)"
        icon="lock-closed-outline"
        value={pin}
        onChangeText={setPin}
        placeholder="••••••"
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
        testID="staff-pin-input"
      />

      <View style={styles.pinRow}>
        {[0, 1, 2, 3, 4, 5].map((idx) => (
          <View key={idx} style={[styles.pinDot, pin.length > idx && styles.pinDotFilled]} />
        ))}
      </View>

      {err && <ReceiptNotice text={err} testID="staff-error" />}

      <ReceiptButton label="Sign in" onPress={submit} busy={busy} style={styles.submit} testID="staff-submit-btn" />

      <ReceiptRule style={styles.rule} />

      <Pressable onPress={() => router.push("/login")} style={styles.link}>
        <Mono style={styles.linkText}>
          Are you an owner? <Mono style={styles.linkAccent}>Business login</Mono>
        </Mono>
      </Pressable>
    </ReceiptFormShell>
  );
}

const styles = StyleSheet.create({
  pinRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: 2,
    marginBottom: 10,
  },
  pinDot: {
    width: 12,
    height: 12,
    borderWidth: 2,
    borderColor: receipt.ink,
  },
  pinDotFilled: {
    backgroundColor: receipt.ink,
  },
  submit: {
    marginTop: 6,
  },
  rule: {
    marginTop: 18,
    marginBottom: 8,
  },
  link: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: receipt.muted,
  },
  linkAccent: {
    fontSize: 13,
    fontWeight: "700",
    color: receipt.accent,
  },
});
