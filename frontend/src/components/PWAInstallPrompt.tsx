import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  Image,
  Dimensions,
} from "react-native";
import { usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "@/src/theme";

export default function PWAInstallPrompt() {
  const pathname = usePathname();

  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [showFloatingPill, setShowFloatingPill] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<string>("default");
  const [showNotifBanner, setShowNotifBanner] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 0. Ensure PWA tags & Service Worker are injected into document.head
    try {
      const injectTag = (tag: string, attrs: Record<string, string>) => {
        let el = document.querySelector(`${tag}[name="${attrs.name || ""}"]`) ||
                 document.querySelector(`${tag}[rel="${attrs.rel || ""}"]`);
        if (!el) {
          el = document.createElement(tag);
          Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
          document.head.appendChild(el);
        }
      };

      injectTag("link", { rel: "manifest", href: "/manifest.json" });
      injectTag("link", { rel: "apple-touch-icon", href: "/apple-touch-icon.png" });
      injectTag("meta", { name: "theme-color", content: "#0F172A" });
      injectTag("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
      injectTag("meta", { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" });
      injectTag("meta", { name: "apple-mobile-web-app-title", content: "EzBill" });
      injectTag("meta", { name: "google-site-verification", content: "google1360c11d4597b537" });

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch((err) => {
          console.warn("[PWA] SW register warning:", err);
        });
      }
    } catch (e) {}

    // 1. Detect Standalone / Installed mode
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes("android-app://");

    setIsStandalone(standalone);

    // 2. Detect iOS / iPadOS
    const ua = window.navigator.userAgent;
    const isAppleMobile =
      /iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    setIsIOS(isAppleMobile);

    // 3. Check Notification permission
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === "default" && standalone) {
        // In standalone mode, if notifications not granted yet, show prompt banner
        setShowNotifBanner(true);
      }
    }

    // 4. If already installed, don't show install popup
    if (standalone) {
      return;
    }

    // 5. Listen for Android / Chrome beforeinstallprompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Auto show modal on first visit if not dismissed
      const dismissed = sessionStorage.getItem("ezbill_pwa_dismissed");
      if (!dismissed) {
        setShowModal(true);
      } else {
        setShowFloatingPill(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // 6. For iOS Safari (which doesn't have beforeinstallprompt)
    const dismissed = sessionStorage.getItem("ezbill_pwa_dismissed");
    const timer = setTimeout(() => {
      if (!standalone && !dismissed) {
        setShowModal(true);
      } else if (!standalone) {
        setShowFloatingPill(true);
      }
    }, 1200);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      clearTimeout(timer);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowModal(false);
        setShowFloatingPill(false);
        setDeferredPrompt(null);
      }
    }
  };

  const handleDismiss = () => {
    setShowModal(false);
    setShowFloatingPill(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("ezbill_pwa_dismissed", "true");
    }
  };

  const handleRequestNotification = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPermission(perm);
        setShowNotifBanner(false);
        if (perm === "granted") {
          new Notification("🔔 EzBill Alerts Enabled", {
            body: "You will now receive live sound and order notifications!",
            icon: "/icon-192.png",
          });
        }
      } catch (err) {
        console.warn("Notification request failed:", err);
      }
    }
  };

  if (Platform.OS !== "web" || pathname !== "/") {
    return null;
  }

  return (
    <>
      {/* 1. Notification Permission Banner when in Standalone / Web mode */}
      {showNotifBanner && notificationPermission === "default" && (
        <View style={styles.notifBanner}>
          <View style={styles.notifBannerLeft}>
            <View style={styles.bellCircle}>
              <Ionicons name="notifications" size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifBannerTitle}>Enable Live Order Alerts</Text>
              <Text style={styles.notifBannerSub}>
                Get instant sounds & alerts for new orders and KOTs
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              style={styles.notifEnableBtn}
              onPress={handleRequestNotification}
              activeOpacity={0.8}
            >
              <Text style={styles.notifEnableBtnText}>Allow Alerts</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowNotifBanner(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 2. Floating Small Pill Button (Accessible whenever modal is minimized) */}
      {!isStandalone && showFloatingPill && !showModal && (
        <TouchableOpacity
          style={styles.floatingPill}
          onPress={() => setShowModal(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="download-outline" size={16} color="#FFFFFF" />
          <Text style={styles.floatingPillText}>Install App</Text>
        </TouchableOpacity>
      )}

      {/* 3. Main PWA Install Modal */}
      {!isStandalone && (
        <Modal
          visible={showModal}
          transparent={true}
          animationType="fade"
          onRequestClose={handleDismiss}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              {/* Close Button */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleDismiss}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>

              {/* App Badge Header */}
              <View style={styles.appHeader}>
                <View style={styles.appIconContainer}>
                  <Ionicons name="restaurant" size={32} color="#635BFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.appTitle}>Install EzBill</Text>
                  <Text style={styles.appSubtitle}>Smart Restaurant POS & ERP</Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.badge}>
                      <Ionicons name="flash" size={11} color="#16A34A" />
                      <Text style={styles.badgeText}>Superfast Speed</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: "#EEF2FF" }]}>
                      <Ionicons name="notifications" size={11} color="#635BFF" />
                      <Text style={[styles.badgeText, { color: "#4F46E5" }]}>Sound Alerts</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.divider} />

              {/* iOS Instructions */}
              {isIOS ? (
                <View style={styles.instructionsContainer}>
                  <Text style={styles.sectionHeader}>
                    Follow 3 simple steps to install on iPhone/iPad:
                  </Text>

                  {/* Step 1 */}
                  <View style={styles.stepRow}>
                    <View style={styles.stepNumberBadge}>
                      <Text style={styles.stepNumberText}>1</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stepText}>
                        Tap the <Text style={styles.stepBold}>Share</Text> button in Safari:
                      </Text>
                      <View style={styles.shareIconBox}>
                        <Ionicons name="share-outline" size={20} color="#007AFF" />
                        <Text style={styles.shareIconLabel}>(Square with arrow at bottom bar)</Text>
                      </View>
                    </View>
                  </View>

                  {/* Step 2 */}
                  <View style={styles.stepRow}>
                    <View style={styles.stepNumberBadge}>
                      <Text style={styles.stepNumberText}>2</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stepText}>
                        Scroll down and tap <Text style={styles.stepBold}>Add to Home Screen</Text> ➕
                      </Text>
                    </View>
                  </View>

                  {/* Step 3 */}
                  <View style={styles.stepRow}>
                    <View style={styles.stepNumberBadge}>
                      <Text style={styles.stepNumberText}>3</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stepText}>
                        Tap <Text style={styles.stepBold}>Add</Text> at the top right.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.iosTipBox}>
                    <Ionicons name="information-circle" size={18} color="#635BFF" />
                    <Text style={styles.iosTipText}>
                      Opening EzBill from your Home Screen gives you full-screen mode, vibration & order chime alerts without App Store download.
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleDismiss}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.primaryButtonText}>Got It, I'll Add It Now</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Android / Desktop / Chrome Instructions */
                <View style={styles.instructionsContainer}>
                  <Text style={styles.sectionHeader}>
                    Install EzBill for the best POS performance and real-time alerts.
                  </Text>

                  {deferredPrompt ? (
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={handleInstallClick}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="download-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={styles.primaryButtonText}>Install App (1-Click)</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.genericInstallGuide}>
                      <Text style={styles.stepText}>
                        1. Click your browser menu <Text style={styles.stepBold}>(⋮ or Settings)</Text>
                      </Text>
                      <Text style={[styles.stepText, { marginTop: 6 }]}>
                        2. Select <Text style={styles.stepBold}>"Install App"</Text> or <Text style={styles.stepBold}>"Add to Home screen"</Text>
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={handleDismiss}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.secondaryButtonText}>Continue in Browser</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Notification Banner
  notifBanner: {
    position: "fixed" as any,
    top: 12,
    left: 16,
    right: 16,
    maxWidth: 520,
    marginHorizontal: "auto" as any,
    backgroundColor: "#0F172A",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    zIndex: 999999,
    borderWidth: 1,
    borderColor: "#334155",
  },
  notifBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  bellCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#635BFF",
    justifyContent: "center",
    alignItems: "center",
  },
  notifBannerTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  notifBannerSub: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
  },
  notifEnableBtn: {
    backgroundColor: "#635BFF",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  notifEnableBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },

  // Floating Pill Button
  floatingPill: {
    position: "fixed" as any,
    bottom: 24,
    right: 24,
    backgroundColor: "#635BFF",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    zIndex: 99999,
    cursor: "pointer" as any,
  },
  floatingPillText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  // Modal Overlay & Card
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    backdropFilter: "blur(4px)" as any,
    zIndex: 999999,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
    cursor: "pointer" as any,
  },
  appHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingRight: 32,
  },
  appIconContainer: {
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: "#EEF0FF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E7FF",
  },
  appTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  appSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    flexWrap: "wrap",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 18,
  },
  instructionsContainer: {
    gap: 14,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 4,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  stepNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#635BFF",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },
  stepNumberText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  stepText: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
  },
  stepBold: {
    fontWeight: "700",
    color: "#0F172A",
  },
  shareIconBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0F9FF",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 4,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  shareIconLabel: {
    fontSize: 12,
    color: "#0284C7",
    fontWeight: "600",
  },
  iosTipBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 4,
  },
  iosTipText: {
    flex: 1,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
  },
  genericInstallGuide: {
    backgroundColor: "#F8FAFC",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginVertical: 4,
  },
  primaryButton: {
    backgroundColor: "#635BFF",
    paddingVertical: 13,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    cursor: "pointer" as any,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    cursor: "pointer" as any,
  },
  secondaryButtonText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
  },
});
