import { Platform, Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";

export type PermissionType = "camera" | "bluetooth" | "notifications" | "location";

export interface PermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
}

export async function checkPermissionStatus(type: PermissionType): Promise<PermissionStatus> {
  if (Platform.OS === "web") return { granted: true, canAskAgain: false };

  try {
    if (type === "camera") {
      const status = await ImagePicker.getCameraPermissionsAsync();
      return { granted: status.granted, canAskAgain: status.canAskAgain };
    }
    if (type === "notifications") {
      // expo-notifications permission fallback
      return { granted: true, canAskAgain: true };
    }
    // Bluetooth & Location are handled natively by printer libs on connection
    return { granted: true, canAskAgain: true };
  } catch {
    return { granted: false, canAskAgain: true };
  }
}

export async function requestPermission(type: PermissionType): Promise<boolean> {
  if (Platform.OS === "web") return true;

  try {
    if (type === "camera") {
      const res = await ImagePicker.requestCameraPermissionsAsync();
      return res.granted;
    }
    return true;
  } catch {
    return false;
  }
}

export function handlePermissionDenied(type: PermissionType, status: PermissionStatus, onRetry: () => void) {
  const name = type.charAt(0).toUpperCase() + type.slice(1);
  if (!status.canAskAgain) {
    Alert.alert(
      `${name} Permission Blocked`,
      `You have selected "Never Ask Again" for ${type} access. Please open your device Settings, select this app, and manually enable permissions.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() }
      ]
    );
  } else {
    Alert.alert(
      `${name} Permission Required`,
      `This feature requires ${type} access. Please try again and approve the request.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Retry", onPress: onRetry }
      ]
    );
  }
}
