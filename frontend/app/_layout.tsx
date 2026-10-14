import "react-native-gesture-handler";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox, StatusBar, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/AuthContext";
import { ThemeProvider } from "@/src/context/ThemeContext";
import { colors } from "@/src/theme";

import { NotificationProvider } from "@/src/context/NotificationContext";
import { CartProvider } from "@/src/context/CartContext";
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
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.title = "EzBill - #1 Restaurant POS, ERP & GST Billing Software";
      
      // Ensure favicon icon link tags exist in the DOM head
      let favicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (!favicon) {
        favicon = document.createElement("link");
        favicon.rel = "shortcut icon";
        document.getElementsByTagName("head")[0].appendChild(favicon);
      }
      favicon.href = "/favicon.ico";
      favicon.type = "image/x-icon";
    }
  }, [loaded, error, fontTimeout]);

  if (!loaded && !error && !fontTimeout) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <CartProvider>
              <NotificationProvider>
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
                <DynamicIslandBanner />
                {Platform.OS === "web" && <PWAInstallPrompt />}
              </NotificationProvider>
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
