import "react-native-gesture-handler";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/AuthContext";
import { ThemeProvider } from "@/src/context/ThemeContext";
import { colors } from "@/src/theme";

import { NotificationProvider } from "@/src/context/NotificationContext";
import DynamicIslandBanner from "@/src/components/DynamicIslandBanner";
import PWAInstallPrompt from "@/src/components/PWAInstallPrompt";

LogBox.ignoreAllLogs(true);
try {
  SplashScreen.preventAutoHideAsync().catch(() => {});
} catch {}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [fontTimeout, setFontTimeout] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFontTimeout(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loaded || error || fontTimeout) {
      SplashScreen.hideAsync().catch(() => {});
    }
    if (typeof document !== "undefined") {
      document.title = "EzBill - Smart Restaurant POS & ERP";
    }
  }, [loaded, error, fontTimeout]);

  if (!loaded && !error && !fontTimeout) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <NotificationProvider>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
              <DynamicIslandBanner />
              <PWAInstallPrompt />
            </NotificationProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
