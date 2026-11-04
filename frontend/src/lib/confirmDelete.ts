import { Alert, Platform } from "react-native";

// Alert.alert does nothing on the website, so the browser's own box is used there
export function confirmDelete(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ]);
}

export function showDeleteError(message: string) {
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert("Could not delete", message);
}
