import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

// Returns base64 string (no data: prefix) or null if cancelled.
export async function pickImageBase64(quality = 0.7): Promise<string | null> {
  if (Platform.OS !== "web") {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error("Photo library permission denied");
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "images",
    quality,
    base64: true,
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  if (asset.base64) return asset.base64;
  return null;
}
