import { useState } from "react";
import {
  View, StyleSheet, Pressable,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import {
  Mono,
  ReceiptButton,
  ReceiptField,
  ReceiptFormShell,
  ReceiptNotice,
  receipt,
} from "@/src/components/ReceiptKit";

export default function Onboarding() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [form, setForm] = useState({
    name: "",
    owner_name: "",
    phone: "",
    address: "",
    upi_id: "",
    merchant_name: "",
    logo_base64: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pickLogo = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
      });
      if (!res.canceled && res.assets[0]?.base64) {
        setForm(f => ({ ...f, logo_base64: res.assets[0].base64 || "" }));
      }
    } catch {}
  };

  const submit = async () => {
    setErr(null);
    if (!form.name.trim() || !form.owner_name.trim() || !form.phone.trim() || !form.upi_id.trim()) {
      setErr("Please enter Restaurant Name, Owner Name, Phone number, and UPI ID.");
      return;
    }
    setBusy(true);
    try {
      await api.saveRestaurant({
        ...form,
        merchant_name: form.merchant_name || form.name,
        gst_enabled: false,
      });
      await refreshUser();
      router.replace("/demo-billing");
    } catch (e: any) {
      setErr(e.message || "Failed to save restaurant details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ReceiptFormShell
      subtitle="Restaurant details"
      title="Your restaurant"
      description="Enter your business details to complete setup"
      maxWidth={520}
    >
      <Pressable style={styles.logoPicker} onPress={pickLogo} accessibilityRole="button" accessibilityLabel="Upload logo or photo">
        {form.logo_base64 ? (
          <Image source={{ uri: `data:image/jpeg;base64,${form.logo_base64}` }} style={styles.logoImg} contentFit="cover" />
        ) : (
          <View style={styles.logoPlaceholder}>
            <Ionicons name="camera-outline" size={26} color={receipt.ink} />
            <Mono style={styles.logoText}>Upload logo or photo</Mono>
          </View>
        )}
      </Pressable>

      <ReceiptField
        label="Restaurant name *"
        value={form.name}
        onChangeText={(t) => setForm({ ...form, name: t })}
        placeholder="e.g. Master Cheff"
      />
      <ReceiptField
        label="Owner name *"
        value={form.owner_name}
        onChangeText={(t) => setForm({ ...form, owner_name: t })}
        placeholder="Full name of owner"
      />
      <ReceiptField
        label="Phone number *"
        value={form.phone}
        onChangeText={(t) => setForm({ ...form, phone: t })}
        placeholder="e.g. 9876543210"
        keyboardType="phone-pad"
      />
      <ReceiptField
        label="Full address"
        value={form.address}
        onChangeText={(t) => setForm({ ...form, address: t })}
        placeholder="Street address, city"
      />
      <ReceiptField
        label="UPI ID (for payments) *"
        value={form.upi_id}
        onChangeText={(t) => setForm({ ...form, upi_id: t })}
        placeholder="e.g. 8152075375-2@ybl"
      />

      {err && <ReceiptNotice text={err} />}

      <ReceiptButton label="Save and continue" icon="arrow-forward" onPress={submit} busy={busy} style={styles.submit} />
    </ReceiptFormShell>
  );
}

const styles = StyleSheet.create({
  logoPicker: {
    alignSelf: "center",
    width: 108,
    height: 108,
    marginBottom: 18,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: receipt.ink,
    overflow: "hidden",
  },
  logoImg: {
    width: "100%",
    height: "100%",
  },
  logoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    gap: 4,
  },
  logoText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  submit: {
    marginTop: 6,
  },
});
