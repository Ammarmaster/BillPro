import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
} from "react-native";
import { usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Mono as Text, receipt } from "@/src/components/ReceiptKit";

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
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof document === "undefined") return;

    try {
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
        injectTag("meta", { name: "theme-color", content: receipt.ink });
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
        (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
        (window.navigator as any)?.standalone === true ||
        (document.referrer && document.referrer.includes("android-app://"));

      setIsStandalone(Boolean(standalone));

      // 2. Detect iOS / iPadOS
      const ua = window.navigator?.userAgent || "";
      const isAppleMobile =
        /iPad|iPhone|iPod/.test(ua) ||
        (window.navigator?.platform === "MacIntel" && (window.navigator?.maxTouchPoints || 0) > 1);
      setIsIOS(Boolean(isAppleMobile));

      // 3. Check Notification permission
      if (typeof window !== "undefined" && "Notification" in window) {
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
        const dismissed = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("ezbill_pwa_dismissed") : null;
        if (!dismissed) {
          setShowModal(true);
        } else {
          setShowFloatingPill(true);
        }
      };

      window.addEventListener("beforeinstallprompt", handleBeforeInstall);

      // 6. For iOS Safari (which doesn't have beforeinstallprompt)
      const dismissed = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("ezbill_pwa_dismissed") : null;
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
    } catch (e) {
      console.warn("[PWAInstallPrompt] init error:", e);
    }
  }, []);

  if (Platform.OS !== "web") return null;

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
              <Ionicons name="notifications" size={18} color={receipt.paper} />
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
              <Ionicons name="close" size={20} color={receipt.rule} />
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
          <Ionicons name="download-outline" size={16} color={receipt.paper} />
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
                <Ionicons name="close" size={22} color={receipt.muted} />
              </TouchableOpacity>

              {/* App Badge Header */}
              <View style={styles.appHeader}>
                <View style={styles.appIconContainer}>
                  <Ionicons name="restaurant" size={32} color={receipt.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.appTitle}>Install EzBill</Text>
                  <Text style={styles.appSubtitle}>Smart Restaurant POS & ERP</Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.badge}>
                      <Ionicons name="flash" size={11} color={receipt.success} />
                      <Text style={styles.badgeText}>Superfast Speed</Text>
                    </View>
                    <View style={styles.badge}>
                      <Ionicons name="notifications" size={11} color={receipt.ink} />
                      <Text style={[styles.badgeText, { color: receipt.ink }]}>Sound Alerts</Text>
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
                        <Ionicons name="share-outline" size={20} color={receipt.ink} />
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
                    <Ionicons name="information-circle" size={18} color={receipt.ink} />
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
                      <Ionicons name="download-outline" size={20} color={receipt.paper} style={{ marginRight: 8 }} />
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
    backgroundColor: receipt.ink,
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
    borderColor: receipt.ink,
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
    backgroundColor: receipt.ink,
    justifyContent: "center",
    alignItems: "center",
  },
  notifBannerTitle: {
    color: receipt.paper,
    fontSize: 14,
    fontWeight: "700",
  },
  notifBannerSub: {
    color: receipt.rule,
    fontSize: 11,
    marginTop: 2,
  },
  notifEnableBtn: {
    backgroundColor: receipt.ink,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  notifEnableBtnText: {
    color: receipt.paper,
    fontSize: 12,
    fontWeight: "600",
  },

  // Floating Pill Button
  floatingPill: {
    position: "fixed" as any,
    bottom: 24,
    right: 24,
    backgroundColor: receipt.ink,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: receipt.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    zIndex: 99999,
    cursor: "pointer" as any,
  },
  floatingPillText: {
    color: receipt.paper,
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
    backgroundColor: receipt.paper,
    borderRadius: 0,
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
    backgroundColor: receipt.tint,
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
    backgroundColor: receipt.tint,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: receipt.ink,
  },
  appTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: receipt.ink,
    letterSpacing: -0.3,
  },
  appSubtitle: {
    fontSize: 13,
    color: receipt.muted,
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
    backgroundColor: receipt.tint,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: receipt.success,
  },
  divider: {
    height: 1,
    backgroundColor: receipt.tint,
    marginVertical: 18,
  },
  instructionsContainer: {
    gap: 14,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "600",
    color: receipt.ink,
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
    backgroundColor: receipt.ink,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },
  stepNumberText: {
    color: receipt.paper,
    fontSize: 12,
    fontWeight: "800",
  },
  stepText: {
    fontSize: 14,
    color: receipt.ink,
    lineHeight: 20,
  },
  stepBold: {
    fontWeight: "700",
    color: receipt.ink,
  },
  shareIconBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: receipt.tint,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 4,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: receipt.rule,
  },
  shareIconLabel: {
    fontSize: 12,
    color: receipt.ink,
    fontWeight: "600",
  },
  iosTipBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: receipt.tint,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: receipt.rule,
    marginTop: 4,
  },
  iosTipText: {
    flex: 1,
    fontSize: 12,
    color: receipt.muted,
    lineHeight: 17,
  },
  genericInstallGuide: {
    backgroundColor: receipt.tint,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: receipt.rule,
    marginVertical: 4,
  },
  primaryButton: {
    backgroundColor: receipt.ink,
    paddingVertical: 13,
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    shadowColor: receipt.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    cursor: "pointer" as any,
  },
  primaryButtonText: {
    color: receipt.paper,
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
    color: receipt.muted,
    fontSize: 14,
    fontWeight: "600",
  },
});
