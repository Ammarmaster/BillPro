import { useState, useEffect, useRef } from "react";
import {
  StyleSheet, Pressable, ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const { resetSuccess } = useLocalSearchParams<{ resetSuccess?: string }>();
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (resetSuccess === "true") {
      setShowSuccessBanner(true);
      const timer = setTimeout(() => {
        setShowSuccessBanner(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [resetSuccess]);

  const submit = async () => {
    setErr(null);
    if (!email.trim() || !password) {
      setErr("Please enter your email or mobile number and password.");
      return;
    }
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      if (u?.role === "waiter") {
        router.replace("/(app)/waiter");
      } else if (u?.role === "kitchen") {
        router.replace("/(app)/kitchen");
      } else {
        router.replace("/(app)/dashboard");
      }
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ReceiptFormShell
      subtitle="Owner login"
      title="Welcome back"
      description="Sign in to manage your restaurant"
      scrollRef={scrollViewRef}
    >
      {showSuccessBanner && (
        <ReceiptNotice tone="success" text="Password reset successfully. Please log in with your new password." />
      )}

      <ReceiptField
        label="Email or mobile number"
        icon={email.trim() && !email.includes("@") && /^\+?[0-9\s-]+$/.test(email.trim()) ? "call-outline" : "mail-outline"}
        value={email}
        onChangeText={setEmail}
        placeholder="email or phone"
        keyboardType="default"
        autoCapitalize="none"
        autoCorrect={false}
        numberOfLines={1}
        testID="login-email-input"
      />

      <ReceiptField
        label="Password"
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        numberOfLines={1}
        onFocus={() => {
          setTimeout(() => {
            scrollViewRef.current?.scrollTo({ y: 160, animated: true });
          }, 150);
        }}
        testID="login-password-input"
        right={
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeBtn}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
          >
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={receipt.muted} />
          </Pressable>
        }
      />

      <Pressable onPress={() => router.push("/forgot-password")} style={styles.forgotBtn}>
        <Mono style={styles.linkAccent}>Forgot password?</Mono>
      </Pressable>

      {err && <ReceiptNotice text={err} />}

      <ReceiptButton label="Sign in" onPress={submit} busy={busy} style={styles.submit} testID="login-submit-btn" />

      <ReceiptRule style={styles.rule} />

      <Pressable onPress={() => router.push("/register")} style={styles.link}>
        <Mono style={styles.linkText}>
          New restaurant? <Mono style={styles.linkAccent}>Create account</Mono>
        </Mono>
      </Pressable>

      <Pressable onPress={() => router.push("/staff-login")} style={styles.link}>
        <Mono style={styles.linkText}>
          Are you an employee? <Mono style={styles.linkAccent}>Staff PIN login</Mono>
        </Mono>
      </Pressable>
    </ReceiptFormShell>
  );
}

const styles = StyleSheet.create({
  eyeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  forgotBtn: {
    alignSelf: "flex-end",
    minHeight: 40,
    justifyContent: "center",
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
