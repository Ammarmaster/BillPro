import { useState, useEffect } from "react";
import {
  StyleSheet, Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Mono,
  ReceiptButton,
  ReceiptField,
  ReceiptFormShell,
  ReceiptNotice,
  receipt,
} from "@/src/components/ReceiptKit";

// Helper to handle API requests manually to avoid changing AuthContext
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "https://billpro-wulv.onrender.com";

export default function ForgotPassword() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(3);
  
  const router = useRouter();

  useEffect(() => {
    if (step === 3) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            router.replace("/login?resetSuccess=true");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [step]);

  const handleRequestPin = async () => {
    if (!email.trim()) {
      setErr("Please enter your email address");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to send verification code");
      }
      setStep(2);
    } catch (e: any) {
      setErr(e.message || "An error occurred");
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (!pin.trim() || pin.length !== 6) {
      setErr("Please enter the 6-digit verification code");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setErr("Password must be at least 6 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr("Passwords do not match");
      return;
    }

    setErr(null);
    setBusy(true);
    try {
      // 1. Verify OTP to get secure reset token
      const verifyRes = await fetch(`${BACKEND_URL}/api/auth/verify-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: pin.trim(),
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.detail || "Invalid or expired verification code");
      }
      
      const resetToken = verifyData.reset_token;

      // 2. Perform password reset using the token
      const resetRes = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          reset_token: resetToken,
          new_password: newPassword,
        }),
      });
      const resetData = await resetRes.json();
      if (!resetRes.ok) {
        throw new Error(resetData.detail || "Failed to reset password");
      }
      
      // Clear OTP session and token state variables
      setPin("");
      setNewPassword("");
      setConfirmPassword("");
      
      // Navigate to dedicated success screen
      setStep(3);
    } catch (e: any) {
      const errMsg = e.message || "";
      if (errMsg.includes("expired") || errMsg.includes("expiry")) {
        setErr("Your password reset session has expired. Please request a new OTP.");
      } else if (errMsg.includes("Invalid reset token") || errMsg.includes("no longer valid")) {
        setErr("This password reset link/session is no longer valid. Please start the password reset process again.");
      } else if (errMsg.includes("strength") || errMsg.includes("weak") || errMsg.includes("validation")) {
        setErr("Please choose a stronger password.");
      } else {
        setErr("Unable to reset password. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const stepCopy =
    step === 3
      ? { title: "Password reset", description: "Your EzBill password has been changed. You can now log in using your new password." }
      : step === 1
        ? { title: "Verify your email", description: "Enter your email address to receive a 6-digit reset code." }
        : { title: "Set new password", description: `Enter the 6-digit code sent to ${email} and choose a new password.` };

  return (
    <ReceiptFormShell
      subtitle="Reset your password"
      title={stepCopy.title}
      description={stepCopy.description}
      onBack={step !== 3 ? () => router.back() : undefined}
    >
      {step === 3 ? (
        <>
          <ReceiptNotice tone="success" text="Password reset successful" />
          <ReceiptButton label="Go to login" style={styles.submit} onPress={() => router.replace("/login?resetSuccess=true")} />
          <Mono style={styles.redirectText}>Redirecting to login in {countdown} seconds...</Mono>
        </>
      ) : step === 1 ? (
        <>
          <ReceiptField
            label="Email address"
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="owner@yourplace.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {err && <ReceiptNotice text={err} />}

          <ReceiptButton label="Send verification code" onPress={handleRequestPin} busy={busy} style={styles.submit} />
        </>
      ) : (
        <>
          <ReceiptField
            label="Verification code"
            icon="key-outline"
            value={pin}
            onChangeText={setPin}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
            autoCapitalize="none"
          />

          <ReceiptField
            label="New password"
            icon="lock-closed-outline"
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="••••••••"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
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

          <ReceiptField
            label="Confirm new password"
            icon="lock-closed-outline"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="••••••••"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />

          {err && <ReceiptNotice text={err} />}

          <ReceiptButton label="Reset password" onPress={handleResetPassword} busy={busy} style={styles.submit} />

          <Pressable onPress={() => setStep(1)} style={styles.link}>
            <Mono style={styles.linkAccent}>Resend code or change email</Mono>
          </Pressable>
        </>
      )}
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
  submit: {
    marginTop: 6,
  },
  link: {
    minHeight: 44,
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  linkAccent: {
    fontSize: 13,
    fontWeight: "700",
    color: receipt.accent,
  },
  redirectText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: receipt.muted,
    marginTop: 14,
  },
});
